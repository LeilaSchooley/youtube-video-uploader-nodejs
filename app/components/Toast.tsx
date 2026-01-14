'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  }[type];

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  }[type];

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div className={`${bgColor} text-white px-6 py-4 rounded-lg shadow-lg min-w-[300px] max-w-md`}>
        <div className="flex items-start gap-3">
          <span className="text-xl font-bold flex-shrink-0">{icon}</span>
          <div className="flex-1">
            <p className="whitespace-pre-line text-sm leading-relaxed">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 font-bold text-lg flex-shrink-0"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

