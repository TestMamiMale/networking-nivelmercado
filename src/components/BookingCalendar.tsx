// src/components/BookingCalendar.tsx
"use client";

import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  isSameMonth,
  isWeekend,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BookingCalendarProps {
  onSelectDate: (date: Date) => void;
  availableSlots?: Record<string, string[]>; // { "YYYY-MM-DD": ["HH:MM", "HH:MM"] }
  /** Permite elegir días sin huecos publicados (gestión de disponibilidad). */
  allowEmptySelection?: boolean;
  /** Permite elegir sábados y domingos. */
  allowWeekends?: boolean;
  /** Día resaltado, en formato "yyyy-MM-dd". */
  selectedDate?: string | null;
}

export default function BookingCalendar({
  onSelectDate,
  availableSlots = {},
  allowEmptySelection = false,
  allowWeekends = false,
  selectedDate = null,
}: BookingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const firstDayOfMonth = startOfMonth(currentMonth);
  const startingDayIndex = firstDayOfMonth.getDay(); // 0 for Sunday, 1 for Monday...

  const goToPreviousMonth = () => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() - 1);
      return newMonth;
    });
  };

  const goToNextMonth = () => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() + 1);
      return newMonth;
    });
  };

  const getDayAvailability = (date: Date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    return availableSlots[dateKey] || [];
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={goToPreviousMonth} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: es })}
        </h2>
        <button onClick={goToNextMonth} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-sm">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
          <div key={day} className="font-medium text-zinc-500 dark:text-zinc-400">
            {day}
          </div>
        ))}
        {Array.from({ length: startingDayIndex === 0 ? 6 : startingDayIndex - 1 }).map(
          (_, i) => (
            <div key={`empty-${i}`} />
          ),
        )}
        {daysInMonth.map((day) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const weekend = isWeekend(day);
          const availability = getDayAvailability(day);
          const dateKey = format(day, "yyyy-MM-dd");

          const isSelectable =
            isCurrentMonth &&
            (allowWeekends || !weekend) &&
            (allowEmptySelection || availability.length > 0);
          const isSelected = selectedDate === dateKey;
          const hasAvailability =
            availability.length > 0 && isCurrentMonth && !weekend;

          return (
            <button
              type="button"
              key={dateKey}
              onClick={() => onSelectDate(day)}
              disabled={!isSelectable}
              aria-pressed={isSelected}
              aria-label={`${format(day, "PPPP", { locale: es })}${
                availability.length > 0
                  ? `, ${availability.length} horarios disponibles`
                  : ""
              }`}
              className={`relative flex h-16 w-full flex-col items-center justify-center rounded-md text-zinc-950 dark:text-zinc-50
                ${!isCurrentMonth && "text-zinc-400 dark:text-zinc-600 opacity-60"}
                ${today && "border-2 border-blue-500"}
                ${weekend && "text-red-500 dark:text-red-400"}
                ${isSelected && "ring-2 ring-blue-600 ring-offset-1"}
                ${
                  hasAvailability
                    ? "bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800"
                    : "bg-zinc-50 dark:bg-zinc-800"
                }
                ${isSelectable ? "cursor-pointer" : "cursor-not-allowed"}
                ${!isSelectable && !hasAvailability && "opacity-60"}
              `}
            >
              <span className="font-semibold">{format(day, "d")}</span>
              {isCurrentMonth && availability.length > 0 && (
                <span className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                  {availability.length} slots
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}