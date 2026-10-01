'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = DayPickerProps;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        root: 'rdp-root',
        months: 'relative flex flex-col',
        month: 'space-y-3',
        month_caption: 'flex h-9 items-center justify-center px-9',
        caption_label: 'text-sm font-semibold',
        dropdowns: 'flex items-center justify-center gap-1.5',
        dropdown_root: 'relative',
        dropdown:
          'h-8 max-w-[7.75rem] cursor-pointer appearance-none rounded-md border border-[#C5D0D4] bg-card px-2 pr-6 text-[13px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
        months_dropdown: 'max-w-[6.5rem]',
        years_dropdown: 'max-w-[4.75rem]',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous:
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-35',
        button_next:
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-35',
        chevron: 'h-4 w-4',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-[11px] font-medium text-muted-foreground',
        week: 'mt-1 flex w-full',
        day: 'relative p-0 text-center text-sm',
        day_button: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        ),
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
        today: '[&>button]:font-semibold [&>button]:text-primary',
        outside: '[&>button]:text-muted-foreground/40',
        disabled: '[&>button]:pointer-events-none [&>button]:opacity-30',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...chevronProps }) =>
          orientation === 'left' ? (
            <ChevronLeft className={cn('h-4 w-4', chevronClass)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn('h-4 w-4', chevronClass)} {...chevronProps} />
          ),
        ...components,
      }}
      {...props}
    />
  );
}

Calendar.displayName = 'Calendar';

export { Calendar };
