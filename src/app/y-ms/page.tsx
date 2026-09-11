"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabaseClient";

type Status = "todo" | "in_progress" | "done";

type Task = {
  id: string;
  title: string;
  description: string | null;
  author: string | null;
  assignee: string | null;
  status: Status;
  position: number;
};

const COLUMNS: { id: Status; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

export default function YMSPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    supabase
      .from("y_ms_tasks")
      .select("*")
      .order("position", { ascending: true })
      .then(({ data }) => {
        setTasks((data as Task[]) ?? []);
        setLoading(false);
      });
  }, []);

  const columns = useMemo(() => {
    const grouped: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) grouped[t.status].push(t);
    for (const status of Object.keys(grouped) as Status[]) {
      grouped[status].sort((a, b) => a.position - b.position);
    }
    return grouped;
  }, [tasks]);

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    const targetPosition = (columns.todo.at(-1)?.position ?? -1) + 1;
    const { data, error } = await supabase
      .from("y_ms_tasks")
      .insert({ title, status: "todo", position: targetPosition })
      .select()
      .single();
    if (!error && data) {
      setTasks((prev) => [...prev, data as Task]);
      setNewTitle("");
    }
  }

  async function updateTask(id: string, patch: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await supabase.from("y_ms_tasks").update(patch).eq("id", id);
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setOpenTaskId(null);
    await supabase.from("y_ms_tasks").delete().eq("id", id);
  }

  function statusOf(id: string): Status | null {
    if (COLUMNS.some((c) => c.id === id)) return id as Status;
    return tasks.find((t) => t.id === id)?.status ?? null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeTask = tasks.find((t) => t.id === active.id);
    const overStatus = statusOf(String(over.id));
    if (!activeTask || !overStatus || activeTask.status === overStatus) return;

    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== activeTask.id);
      const overIndex = next.findIndex((t) => t.id === over.id);
      const insertAt = overIndex === -1 ? next.length : overIndex;
      next.splice(insertAt, 0, { ...activeTask, status: overStatus });
      return next;
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeTask = tasks.find((t) => t.id === active.id);
    const overStatus = statusOf(String(over.id));
    if (!activeTask || !overStatus) return;

    let ordered = columns[overStatus];
    if (active.id !== over.id) {
      const oldIndex = ordered.findIndex((t) => t.id === active.id);
      const newIndex = ordered.findIndex((t) => t.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        ordered = [...ordered];
        const [moved] = ordered.splice(oldIndex, 1);
        ordered.splice(newIndex, 0, moved);
      }
    }

    const updates = ordered.map((t, i) => ({ ...t, status: overStatus, position: i }));
    setTasks((prev) => {
      const others = prev.filter((t) => t.status !== overStatus);
      return [...others, ...updates];
    });

    for (const u of updates) {
      await supabase.from("y_ms_tasks").update({ status: u.status, position: u.position }).eq("id", u.id);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-100">Y-M-S — Tasks</h1>
          <Link href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to projects
          </Link>
        </div>

        <div className="mt-4 flex gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="New task title… (add details after creating)"
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none"
          />
          <button
            onClick={addTask}
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Add
          </button>
        </div>

        {loading ? (
          <p className="mt-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {COLUMNS.map((col) => (
                <Column
                  key={col.id}
                  id={col.id}
                  label={col.label}
                  tasks={columns[col.id]}
                  onOpen={setOpenTaskId}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      {openTask && (
        <TaskModal
          task={openTask}
          onClose={() => setOpenTaskId(null)}
          onSave={(patch) => updateTask(openTask.id, patch)}
          onDelete={() => deleteTask(openTask.id)}
        />
      )}
    </div>
  );
}

function Column({
  id,
  label,
  tasks,
  onOpen,
}: {
  id: Status;
  label: string;
  tasks: Task[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="flex min-h-[240px] flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="text-[11px] text-zinc-600">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={onOpen} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
      className="cursor-grab rounded-md border border-zinc-800 bg-zinc-900 p-2.5 hover:border-zinc-700 active:cursor-grabbing"
    >
      <p className="text-[13px] font-medium text-zinc-100">{task.title}</p>
      {(task.author || task.assignee) && (
        <p className="mt-1 text-[11px] text-zinc-500">
          {task.author && <span>by {task.author}</span>}
          {task.author && task.assignee && <span> · </span>}
          {task.assignee && <span>for {task.assignee}</span>}
        </p>
      )}
      {task.description && <p className="mt-1 line-clamp-2 text-[12px] text-zinc-500">{task.description}</p>}
    </div>
  );
}

function TaskModal({
  task,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  onSave: (patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [author, setAuthor] = useState(task.author ?? "");
  const [assignee, setAssignee] = useState(task.assignee ?? "");
  const [copied, setCopied] = useState(false);

  function save() {
    onSave({
      title: title.trim() || task.title,
      description: description.trim() || null,
      author: author.trim() || null,
      assignee: assignee.trim() || null,
    });
    onClose();
  }

  async function copyDescription() {
    if (!description) return;
    await navigator.clipboard.writeText(description);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-100 focus:border-indigo-400 focus:outline-none"
        />

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Author</label>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="—"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Assignee</label>
            <input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="—"
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Description (markdown)</label>
            <button
              onClick={copyDescription}
              className="text-[11px] text-indigo-400 hover:text-indigo-300"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={10}
            placeholder="Detailed notes, mechanics, ideas… plain markdown, pastes straight into Obsidian."
            className="mt-1 w-full resize-y rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <button onClick={onDelete} className="text-[12px] text-rose-400 hover:text-rose-300">
            Delete task
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
