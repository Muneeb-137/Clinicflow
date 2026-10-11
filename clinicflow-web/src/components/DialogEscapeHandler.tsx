import { useEffect } from "react";

/*
 * Escape closes the dialog on top, for every dialog marked
 * with a data-dialog attribute.
 *
 * It presses that dialog's own close button, so the dialog
 * closes exactly as if the button were clicked (including
 * any "are you sure" logic), and does nothing while that
 * button is disabled (e.g. while saving). The close button
 * is the one marked data-dialog-close, otherwise a button
 * labelled "Close", otherwise one reading "Cancel" or
 * "Close".
 */
function findCloseButton(dialog: Element) {
  const marked = dialog.querySelector<HTMLButtonElement>(
    "[data-dialog-close]",
  );

  if (marked) {
    return marked;
  }

  const labelled = dialog.querySelector<HTMLButtonElement>(
    'button[aria-label="Close"]',
  );

  if (labelled) {
    return labelled;
  }

  return (
    Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) =>
        /^(cancel|close)$/i.test(button.textContent?.trim() ?? ""),
    ) ?? null
  );
}

function DialogEscapeHandler() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      const dialogs = document.querySelectorAll("[data-dialog]");
      const topDialog = dialogs[dialogs.length - 1];

      if (!topDialog) {
        return;
      }

      const closeButton = findCloseButton(topDialog);

      if (closeButton && !closeButton.disabled) {
        event.preventDefault();
        closeButton.click();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () =>
      window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}

export default DialogEscapeHandler;
