export type AppDialogType = 'alert' | 'confirm';
export type AppDialogIcon = 'export' | 'archive' | 'delete' | 'info' | 'success' | 'warning';

export interface AppDialogRequest {
  type: AppDialogType;
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: AppDialogIcon;
}

type DialogHandler = (request: AppDialogRequest) => Promise<boolean>;

let dialogHandler: DialogHandler | null = null;

export const setAppDialogHandler = (handler: DialogHandler | null) => {
  dialogHandler = handler;
};

export const appConfirm = async (
  message: string,
  options: Omit<AppDialogRequest, 'type' | 'message'> = {},
): Promise<boolean> => {
  if (dialogHandler) {
    return dialogHandler({ type: 'confirm', message, ...options });
  }
  return window.confirm(message);
};

export const appAlert = async (
  message: string,
  options: Omit<AppDialogRequest, 'type' | 'message'> = {},
): Promise<void> => {
  if (dialogHandler) {
    await dialogHandler({ type: 'alert', message, ...options });
    return;
  }
  window.alert(message);
};
