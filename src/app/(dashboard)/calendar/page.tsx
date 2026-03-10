"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";
import type { EventInput, DateSelectArg, EventClickArg, EventDropArg, DatesSetArg } from "@fullcalendar/core";
import { getPostsForCalendar, reschedulePost } from "@/lib/actions/posts";

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  DRAFT: { bg: "#f3f4f6", border: "#9ca3af", text: "#374151" },
  SCHEDULED: { bg: "#dbeafe", border: "#3b82f6", text: "#1d4ed8" },
  PUBLISHING: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  PUBLISHED: { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  FAILED: { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
};

export default function CalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(false);

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    const posts = await getPostsForCalendar(
      start.toISOString(),
      end.toISOString()
    );

    if (Array.isArray(posts)) {
      const mapped: EventInput[] = posts.map((post: any) => {
        const date = post.scheduledAt || post.publishedAt || post.createdAt;
        const colors = STATUS_COLORS[post.status] || STATUS_COLORS.DRAFT;
        const accounts = post.targets
          ?.map((t: any) => t.socialAccount?.displayName)
          .filter(Boolean)
          .join(", ");

        return {
          id: post.id,
          title: post.content.slice(0, 60) + (post.content.length > 60 ? "..." : ""),
          start: date,
          allDay: true,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          textColor: colors.text,
          editable: post.status === "DRAFT" || post.status === "SCHEDULED",
          extendedProps: {
            status: post.status,
            accounts,
          },
        };
      });
      setEvents(mapped);
    }
    setLoading(false);
  }, []);

  function handleDatesSet(arg: DatesSetArg) {
    loadEvents(arg.start, arg.end);
  }

  function handleDateClick(arg: DateSelectArg) {
    const dateStr = arg.startStr;
    router.push(`/posts/new?scheduledAt=${dateStr}T09:00`);
  }

  function handleEventClick(arg: EventClickArg) {
    router.push(`/posts/${arg.event.id}/edit`);
  }

  async function handleEventDrop(arg: EventDropArg) {
    const newDate = arg.event.start;
    if (!newDate) return;

    const result = await reschedulePost(arg.event.id, newDate.toISOString());
    if (result && "error" in result) {
      arg.revert();
      alert(result.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Calendrier</h2>
        {loading && (
          <span className="text-xs text-gray-400">Chargement...</span>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={frLocale}
          events={events}
          editable={true}
          selectable={true}
          select={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          datesSet={handleDatesSet}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "",
          }}
          height="auto"
          dayMaxEvents={3}
          eventDisplay="block"
          eventContent={(arg) => {
            const status = arg.event.extendedProps.status;
            const statusLabel: Record<string, string> = {
              DRAFT: "Brouillon",
              SCHEDULED: "Programmé",
              PUBLISHED: "Publié",
              FAILED: "Échoué",
            };
            return (
              <div className="px-1 py-0.5 text-xs leading-tight overflow-hidden cursor-pointer">
                <div className="font-medium truncate">{arg.event.title}</div>
                <div className="opacity-70 text-[10px]">
                  {statusLabel[status] || status}
                  {arg.event.extendedProps.accounts && (
                    <span> · {arg.event.extendedProps.accounts}</span>
                  )}
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => {
          const labels: Record<string, string> = {
            DRAFT: "Brouillon",
            SCHEDULED: "Programmé",
            PUBLISHING: "En cours",
            PUBLISHED: "Publié",
            FAILED: "Échoué",
          };
          return (
            <div key={status} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm border"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}
              />
              {labels[status]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
