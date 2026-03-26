'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ActionItemToggleProps {
  itemId: string;
  status: 'open' | 'done' | 'overdue';
}

export function ActionItemToggle({ itemId, status }: ActionItemToggleProps) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const toggle = async () => {
    const newStatus = currentStatus === 'done' ? 'open' : 'done';
    setLoading(true);
    setCurrentStatus(newStatus);

    try {
      const res = await fetch(`/api/action-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        setCurrentStatus(currentStatus); // Revert
      } else {
        router.refresh();
      }
    } catch {
      setCurrentStatus(currentStatus);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all',
        currentStatus === 'done'
          ? 'bg-green-500 border-green-500'
          : currentStatus === 'overdue'
          ? 'border-red-400'
          : 'border-slate-300 hover:border-blue-400',
        loading && 'opacity-50'
      )}
      title={currentStatus === 'done' ? 'Mark as open' : 'Mark as done'}
    >
      {currentStatus === 'done' && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
