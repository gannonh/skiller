export async function runOrganizationAction(
  begin: () => boolean,
  finish: () => void,
  onError: (message: string) => void,
  action: () => Promise<void>
): Promise<boolean> {
  if (!begin()) return false;
  try {
    await action();
    return true;
  } catch (caught) {
    onError(caught instanceof Error ? caught.message : String(caught));
    return false;
  } finally {
    finish();
  }
}
