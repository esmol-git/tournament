import { describe, expect, it } from 'vitest'
import { getApiErrorCode, getApiErrorMessage } from './apiError'

describe('getApiErrorCode', () => {
  it('reads code from data', () => {
    expect(getApiErrorCode({ data: { code: 'MATCH_DUPLICATE' } })).toBe(
      'MATCH_DUPLICATE',
    )
  })

  it('reads code from response._data', () => {
    expect(
      getApiErrorCode({
        response: { _data: { code: 'FOO', message: 'x' } },
      }),
    ).toBe('FOO')
  })

  it('returns undefined when missing', () => {
    expect(getApiErrorCode({ data: { message: 'err' } })).toBeUndefined()
    expect(getApiErrorCode(null)).toBeUndefined()
  })
})

describe('getApiErrorMessage', () => {
  it('still reads message when code present', () => {
    expect(
      getApiErrorMessage({
        data: {
          code: 'MATCH_DUPLICATE',
          message: 'Матч уже есть',
        },
      }),
    ).toBe('Матч уже есть')
  })
})
