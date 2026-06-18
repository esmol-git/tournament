import {
  MatchRefereeRole,
  TournamentMatchOfficialsProfile,
  TournamentVenueMode,
} from '@prisma/client';

export type VenueSlot = { stadiumId: string; pitchNumber: number };

export function expandStadiumsToVenueSlots(
  stadiumIds: string[],
  pitchCountByStadiumId: Map<string, number | null | undefined>,
): VenueSlot[] {
  const slots: VenueSlot[] = [];
  for (const stadiumId of stadiumIds) {
    const raw = pitchCountByStadiumId.get(stadiumId);
    const pitches = Math.max(1, Number(raw) || 1);
    for (let pitchNumber = 1; pitchNumber <= pitches; pitchNumber += 1) {
      slots.push({ stadiumId, pitchNumber });
    }
  }
  return slots;
}

export function rolesForOfficialsProfile(
  profile: TournamentMatchOfficialsProfile,
): MatchRefereeRole[] {
  switch (profile) {
    case TournamentMatchOfficialsProfile.MAIN_ONLY:
      return [MatchRefereeRole.MAIN];
    case TournamentMatchOfficialsProfile.CREW_OF_3:
      return [
        MatchRefereeRole.MAIN,
        MatchRefereeRole.ASSISTANT_1,
        MatchRefereeRole.ASSISTANT_2,
      ];
    case TournamentMatchOfficialsProfile.CREW_OF_3_WITH_VAR:
      return [
        MatchRefereeRole.MAIN,
        MatchRefereeRole.ASSISTANT_1,
        MatchRefereeRole.ASSISTANT_2,
        MatchRefereeRole.VAR,
      ];
    default:
      return [MatchRefereeRole.MAIN];
  }
}

/** Минимум судей в пуле для параллельных слотов с полной бригадой на каждый. */
export function minRefereesRequiredForParallelSlots(
  profile: TournamentMatchOfficialsProfile,
  simultaneousMatches: number,
): number {
  const parallel = Math.max(1, simultaneousMatches);
  return rolesForOfficialsProfile(profile).length * parallel;
}

/**
 * Назначение площадки и поля с учётом pitchCount и режима venueMode.
 * Слот считается занятым до конца матча (start + duration).
 */
export class VenueSlotAssigner {
  private readonly slots: VenueSlot[];
  private readonly venueMode: TournamentVenueMode;
  private readonly homeStadiumByTeamId: Map<string, string | null>;
  private readonly busyUntil = new Map<string, number>();
  private rrIndex = 0;

  constructor(params: {
    slots: VenueSlot[];
    venueMode: TournamentVenueMode;
    homeStadiumByTeamId: Map<string, string | null>;
  }) {
    this.slots = params.slots;
    this.venueMode = params.venueMode;
    this.homeStadiumByTeamId = params.homeStadiumByTeamId;
  }

  get totalSlots(): number {
    return this.slots.length;
  }

  private slotKey(slot: VenueSlot): string {
    return `${slot.stadiumId}:${slot.pitchNumber}`;
  }

  private isSlotFree(slot: VenueSlot, startMs: number): boolean {
    return (this.busyUntil.get(this.slotKey(slot)) ?? 0) <= startMs;
  }

  private markBusy(slot: VenueSlot, startMs: number, slotDurationMs: number) {
    this.busyUntil.set(this.slotKey(slot), startMs + slotDurationMs);
  }

  private pickFrom(candidates: VenueSlot[], startMs: number, slotDurationMs: number) {
    if (!candidates.length) return null;
    for (let i = 0; i < candidates.length; i += 1) {
      const idx = (this.rrIndex + i) % candidates.length;
      const slot = candidates[idx];
      if (!slot || !this.isSlotFree(slot, startMs)) continue;
      this.rrIndex = (idx + 1) % candidates.length;
      this.markBusy(slot, startMs, slotDurationMs);
      return slot;
    }
    return null;
  }

  assign(params: {
    homeTeamId: string;
    startMs: number;
    slotDurationMs: number;
  }): { stadiumId: string | null; pitchNumber: number | null } {
    if (!this.slots.length) {
      return { stadiumId: null, pitchNumber: null };
    }

    const { homeTeamId, startMs, slotDurationMs } = params;
    const homeStadiumId = this.homeStadiumByTeamId.get(homeTeamId) ?? null;

    if (this.venueMode === TournamentVenueMode.HOME_STADIUM && homeStadiumId) {
      const homeSlots = this.slots.filter((s) => s.stadiumId === homeStadiumId);
      const picked = this.pickFrom(homeSlots, startMs, slotDurationMs);
      if (picked) {
        return {
          stadiumId: picked.stadiumId,
          pitchNumber: picked.pitchNumber > 1 ? picked.pitchNumber : null,
        };
      }
    }

    if (this.venueMode === TournamentVenueMode.SINGLE_VENUE) {
      const firstStadiumId = this.slots[0]?.stadiumId;
      const singleSlots = firstStadiumId
        ? this.slots.filter((s) => s.stadiumId === firstStadiumId)
        : this.slots;
      const picked = this.pickFrom(singleSlots, startMs, slotDurationMs);
      if (picked) {
        return {
          stadiumId: picked.stadiumId,
          pitchNumber: picked.pitchNumber > 1 ? picked.pitchNumber : null,
        };
      }
    }

    const picked = this.pickFrom(this.slots, startMs, slotDurationMs);
    if (picked) {
      return {
        stadiumId: picked.stadiumId,
        pitchNumber: picked.pitchNumber > 1 ? picked.pitchNumber : null,
      };
    }

    const fallback = this.slots[this.rrIndex % this.slots.length];
    if (!fallback) return { stadiumId: null, pitchNumber: null };
    this.rrIndex += 1;
    return {
      stadiumId: fallback.stadiumId,
      pitchNumber: fallback.pitchNumber > 1 ? fallback.pitchNumber : null,
    };
  }
}

export type RefereeAssignment = {
  refereeId: string;
  role: MatchRefereeRole;
};

/** Подбор свободных судей из пула турнира (round-robin, без двойного бронирования). */
export function assignRefereesForMatch(params: {
  requiredRoles: MatchRefereeRole[];
  refereePool: string[];
  refereeBusyUntil: Map<string, number>;
  startMs: number;
  slotDurationMs: number;
  poolCursor: { index: number };
}): RefereeAssignment[] {
  const {
    requiredRoles,
    refereePool,
    refereeBusyUntil,
    startMs,
    slotDurationMs,
    poolCursor,
  } = params;
  if (!refereePool.length || !requiredRoles.length) return [];

  const assignments: RefereeAssignment[] = [];
  const usedThisMatch = new Set<string>();

  for (const role of requiredRoles) {
    let assigned = false;
    for (let attempt = 0; attempt < refereePool.length; attempt += 1) {
      const idx = (poolCursor.index + attempt) % refereePool.length;
      const refereeId = refereePool[idx];
      if (!refereeId || usedThisMatch.has(refereeId)) continue;
      if ((refereeBusyUntil.get(refereeId) ?? 0) > startMs) continue;
      assignments.push({ refereeId, role });
      usedThisMatch.add(refereeId);
      refereeBusyUntil.set(refereeId, startMs + slotDurationMs);
      poolCursor.index = (idx + 1) % refereePool.length;
      assigned = true;
      break;
    }
    if (!assigned) break;
  }

  return assignments;
}
