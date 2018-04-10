export const upperCaseWords = str =>
  str
    .split(/\s+/)
    .map(s => `${s[0].toUpperCase()}${s.slice(1, s.length)}`)
    .join(' ')
