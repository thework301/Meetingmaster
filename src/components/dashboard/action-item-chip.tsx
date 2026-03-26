'use client';
import { AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

interface ActionItemChipProps {
  item: {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
    escalated: boolean;
  };
}

export function ActionItemChip({ item }: ActionItemChipProps) {
  const isOverdue = item.status === 'overdue';
  const isDone = item.status === 'done';

  return (
    <div
      className={cn(
        'flex items-start gap-2 p-2.5 rounded-lg border text-sm',
        isOverdue ? 'bg-red-50 border-red-200' :
        isDone ? 'bg-green-50 border-green-200' :
        'bg-white border-slate-200'
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isOverdue ? (
          <AlertCircle className="w-4 h-4 text-red-500" />
        ) : isDone ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : (
          <Clock className="w-4 h-4 text-blue-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium truncate', isOverdue && 'text-red-700', isDone && 'text-slate-400 line-through')}>
          {item.title}
        </p>
        {item.due_date && (
          <p className={cn('text-xs mt-0.5', isOverdue ? 'text-red-500' : 'text-slate-400')}>
            Due {formatDate(item.due_date)}
            {item.escalated && <span className="ml-1 text-red-500 font-medium">· Escalated</span>}
          </p>
        )}
      </div>
    </div>
  );
}
