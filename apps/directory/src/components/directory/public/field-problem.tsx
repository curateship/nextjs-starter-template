/**
 * What is wrong with one box, drawn in the gap under it rather than in the
 * column of fields, so no box ever moves when a message appears. The box it
 * belongs to needs `relative` on its wrapper.
 *
 * It used to sit in the column: the message appeared when a box was left,
 * everything under it dropped 20px, and a press that started on the next box
 * landed somewhere else by the time it was let go, so the first press did
 * nothing at all. Reserving an empty line for it instead pushed every field
 * 16px further apart, which is worse. The message is 16px tall and the gap
 * between fields is 16px (`gap-4`), so out of flow it fits the gap exactly.
 *
 * Used by the public Add your listing and Suggest an event forms.
 */
export function FieldProblem({
  id,
  problem,
}: {
  id: string
  problem: string | null
}) {
  return problem ? (
    <p
      id={`${id}-problem`}
      className="absolute top-full left-0 text-xs leading-4 text-destructive"
    >
      {problem}
    </p>
  ) : null
}
