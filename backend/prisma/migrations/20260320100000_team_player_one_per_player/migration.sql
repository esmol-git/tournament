-- Один игрок — не более одной записи в TeamPlayer
DELETE FROM "TeamPlayer" AS a
USING "TeamPlayer" AS b
WHERE a."playerId" = b."playerId" AND a.id > b.id;

-- При удалении игрока каскадно убираем связь
ALTER TABLE "TeamPlayer" DROP CONSTRAINT "TeamPlayer_playerId_fkey";
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TeamPlayer_playerId_key" ON "TeamPlayer"("playerId");
