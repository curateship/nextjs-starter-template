/**
 * A job that cannot work however often it is tried: the account has no
 * profile, the profile is gone, or its proxy failed its last test.
 *
 * The browser program gives a job three tries because a page can be slow or a
 * container can be cold. Trying one of these three times only repeats the same
 * sentence three times, and records the refusal three times in the profile's
 * history, so the runner fails it on the first.
 */
export class Refusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = "Refusal"
  }
}
