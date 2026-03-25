import React, { useEffect, useState } from 'react';
import { AlertTriangle, CircleCheck, FileText, Archive, Trash2, Info, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import { AppDialogRequest, AppDialogIcon, AppDialogType, setAppDialogHandler } from '../../utils/appDialog';

interface QueueItem {
  request: AppDialogRequest;
  resolve: (value: boolean) => void;
}

export const AppDialogHost = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    setAppDialogHandler((request) =>
      new Promise<boolean>((resolve) => {
        setQueue((prev) => [...prev, { request, resolve }]);
      }),
    );

    return () => {
      setAppDialogHandler(null);
    };
  }, []);

  const active = queue[0] || null;
  const request = active?.request;

  const closeWith = (value: boolean) => {
    if (!active) return;
    active.resolve(value);
    setQueue((prev) => prev.slice(1));
  };

  const getIconConfig = (icon?: AppDialogIcon, type?: AppDialogType) => {
    const configs: Record<AppDialogIcon, { Icon: any; bg: string; color: string }> = {
      export: {
        Icon: FileText,
        bg: 'bg-teal-100 dark:bg-teal-900/30',
        color: 'text-teal-700 dark:text-teal-300',
      },
      archive: {
        Icon: Archive,
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        color: 'text-amber-600 dark:text-amber-400',
      },
      delete: {
        Icon: Trash2,
        bg: 'bg-red-100 dark:bg-red-900/30',
        color: 'text-red-600 dark:text-red-400',
      },
      info: {
        Icon: Info,
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        color: 'text-blue-700 dark:text-blue-300',
      },
      success: {
        Icon: CheckCircle2,
        bg: 'bg-green-100 dark:bg-green-900/30',
        color: 'text-green-700 dark:text-green-300',
      },
      warning: {
        Icon: AlertTriangle,
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        color: 'text-amber-600 dark:text-amber-400',
      },
    };

    if (icon && configs[icon]) {
      return configs[icon];
    }

    // Default based on type
    return type === 'alert'
      ? configs.success
      : configs.warning;
  };

  const iconConfig = getIconConfig(request?.icon, request?.type);

  return (
    <Modal
      open={!!active}
      title={request?.title || (request?.type === 'confirm' ? 'Please Confirm' : 'Notice')}
      onClose={() => closeWith(false)}
    >
      <div className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-4 gap-y-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconConfig.bg}`}>
          <iconConfig.Icon size={18} className={iconConfig.color} />
        </div>
        <p className="m-0 text-sm leading-6 text-slate-700 dark:text-slate-200">{request?.message}</p>
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
        {request?.type === 'confirm' && (
          <button
            onClick={() => closeWith(false)}
            className="px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {request.cancelText || 'Cancel'}
          </button>
        )}
        <button
          onClick={() => closeWith(true)}
          className="px-4 py-2 text-sm font-bold text-white bg-teal-deep rounded-xl hover:bg-teal-green transition-colors shadow-sm"
        >
          {request?.confirmText || 'OK'}
        </button>
      </div>
    </Modal>
  );
};

export default AppDialogHost;
