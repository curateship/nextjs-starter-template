import { getFitnessErrorMessage } from "@/lib/fitness/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Shows a failed Fitness request as the one red toast, in the server's own words when it has them. */
export function reportFitnessError(error: unknown) {
  showErrorToast(getFitnessErrorMessage(error))
}
