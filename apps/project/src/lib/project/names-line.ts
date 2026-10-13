/** "Ben Tester", "Ben Tester and Leo Hart", "Ben Tester, Leo Hart and 2 more". */
export function namesLine(people: readonly string[]) {
  if (people.length <= 2) return people.join(" and ")
  if (people.length === 3) return `${people[0]}, ${people[1]} and ${people[2]}`
  return `${people[0]}, ${people[1]} and ${people.length - 2} more`
}
