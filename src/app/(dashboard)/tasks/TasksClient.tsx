"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ListTodo,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Search,
  Filter,
  UserCheck,
  Building,
  Check,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createTaskAction,
  updateTaskStatusAction,
} from "@/lib/server/actions/task-actions";
import { TaskStatus, TaskType } from "@prisma/client";

interface TaskRecord {
  id: string;
  type: TaskType;
  title: string;
  detail: string | null;
  status: TaskStatus;
  priority: string;
  dueDate: Date | null;
  client: {
    id: string;
    name: string;
  } | null;
  assignedTo: {
    id: string;
    name: string;
  } | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface TeamMemberOption {
  id: string;
  name: string;
  role: string;
}

interface Props {
  tasks: TaskRecord[];
  clients: ClientOption[];
  teamMembers: TeamMemberOption[];
}

export function TasksClient({ tasks, clients, teamMembers }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [type, setType] = useState<TaskType>(TaskType.GENERAL);
  const [priority, setPriority] = useState("NORMAL");
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [assignedToId, setAssignedToId] = useState(teamMembers[0]?.id || "");
  const [dueDate, setDueDate] = useState("2026-10-25");
  const [formError, setFormError] = useState<string | null>(null);

  const openCount = tasks.filter((t) => t.status === TaskStatus.OPEN).length;
  const inProgressCount = tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS).length;
  const completedCount = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || title.trim().length < 3) {
      setFormError("Please enter a descriptive task title.");
      return;
    }

    startTransition(async () => {
      const res = await createTaskAction({
        title,
        detail: detail || null,
        type,
        priority,
        clientId: clientId || null,
        assignedToId: assignedToId || null,
        dueDate: dueDate || null,
      });

      if (res.success) {
        setIsModalOpen(false);
        setTitle("");
        setDetail("");
        router.refresh();
      } else {
        setFormError(res.error || "Unable to create task.");
      }
    });
  };

  const handleToggleStatus = (taskId: string, currentStatus: TaskStatus) => {
    const nextStatus =
      currentStatus === TaskStatus.COMPLETED
        ? TaskStatus.OPEN
        : TaskStatus.COMPLETED;

    startTransition(async () => {
      await updateTaskStatusAction(taskId, nextStatus);
      router.refresh();
    });
  };

  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== "ALL" && task.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const titleMatch = task.title.toLowerCase().includes(term);
      const clientMatch = (task.client?.name || "").toLowerCase().includes(term);
      const assigneeMatch = (task.assignedTo?.name || "").toLowerCase().includes(term);
      if (!titleMatch && !clientMatch && !assigneeMatch) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-graphite-900">
            Tasks & Partner Approvals
          </h1>
          <p className="text-xs sm:text-sm text-graphite-500 mt-0.5">
            Operational workflows, invoice threshold approvals, and compliance assignments.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => {
            setFormError(null);
            setIsModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" />
          Assign Practice Task
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Open Workflows"
          value={openCount}
          subtitle="Tasks awaiting initiation"
          badge={openCount > 0 ? "Pending" : "Cleared"}
          badgeVariant={openCount > 0 ? "warning" : "success"}
          icon={<ListTodo className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="In Progress"
          value={inProgressCount}
          subtitle="Active execution by staff"
          badge="Active"
          badgeVariant="neutral"
          icon={<Clock className="w-4 h-4 text-amber-600" />}
        />
        <MetricCard
          title="Completed"
          value={completedCount}
          subtitle="Signed-off workflows"
          badge="Completed"
          badgeVariant="success"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        />
        <MetricCard
          title="High Priority"
          value={tasks.filter((t) => t.priority === "URGENT" || t.priority === "HIGH").length}
          subtitle="Partner attention needed"
          badge="Urgent"
          badgeVariant="danger"
          icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
        />
      </div>

      {/* Tasks Table / Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-graphite-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search tasks, clients, assigned staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#FAF9F5] border border-[#E2E0D8] rounded-lg pl-9 pr-4 py-2 text-xs sm:text-sm text-graphite-900 placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-graphite-500">Filter:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-[#E2E0D8] rounded-lg px-2.5 py-1.5 text-xs text-graphite-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </CardHeader>

        {filteredTasks.length === 0 ? (
          <EmptyState
            title="No tasks match this filter"
            description="All active practice assignments have been addressed or no tasks match your search query."
            actionLabel="Create Workflow Task"
            onAction={() => setIsModalOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto border-t border-[#EBE9E1]">
            <table className="w-full text-left text-sm text-graphite-700">
              <thead className="bg-[#FAF9F5] text-[11px] uppercase tracking-wider text-graphite-500 font-semibold border-b border-[#E2E0D8]">
                <tr>
                  <th className="px-5 py-3.5 w-12 text-center">Done</th>
                  <th className="px-4 py-3.5">Task Description</th>
                  <th className="px-4 py-3.5">Related Client</th>
                  <th className="px-4 py-3.5">Assigned To</th>
                  <th className="px-4 py-3.5">Due Date</th>
                  <th className="px-4 py-3.5 text-center">Priority</th>
                  <th className="px-5 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE9E1]">
                {filteredTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-[#FAF9F5] transition-colors">
                    <td className="px-5 py-4 text-center">
                      <button
                        onClick={() => handleToggleStatus(t.id, t.status)}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          t.status === TaskStatus.COMPLETED
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-[#E2E0D8] bg-white hover:border-emerald-500"
                        }`}
                        title="Toggle task completion"
                      >
                        {t.status === TaskStatus.COMPLETED && <Check className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div
                        className={`font-semibold text-xs text-graphite-900 ${
                          t.status === TaskStatus.COMPLETED ? "line-through text-graphite-400" : ""
                        }`}
                      >
                        {t.title}
                      </div>
                      {t.detail && (
                        <p className="text-[11px] text-graphite-500 mt-0.5 line-clamp-1">
                          {t.detail}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs">
                      {t.client ? (
                        <Link
                          href={`/clients/${t.client.id}`}
                          className="font-medium text-graphite-900 hover:text-emerald-700"
                        >
                          {t.client.name}
                        </Link>
                      ) : (
                        <span className="text-graphite-400 font-medium">Internal Firm</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-graphite-700">
                      {t.assignedTo?.name || "Unassigned"}
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-graphite-600">
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge
                        variant={
                          t.priority === "URGENT"
                            ? "danger"
                            : t.priority === "HIGH"
                            ? "warning"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {t.priority}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Badge
                        variant={
                          t.status === TaskStatus.COMPLETED
                            ? "success"
                            : t.status === TaskStatus.IN_PROGRESS
                            ? "neutral"
                            : "warning"
                        }
                        size="sm"
                      >
                        {t.status.replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Task Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          if (!isPending) setIsModalOpen(false);
        }}
        title="Assign Practice Task"
        description="Create workflow assignment linked to a client account and team member."
        maxWidth="md"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <div>
            <Input
              label="Task Title"
              requiredIndicator
              placeholder="e.g. Form 3CD Annexures Final Partner Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Input
              label="Detailed Instructions / Scope"
              placeholder="e.g. Verify depreciation schedule under Section 32"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Select
              label="Related Client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Internal Firm Task</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Select
              label="Assignee"
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
            >
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Select
              label="Priority Level"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent Escalation</option>
              <option value="LOW">Low</option>
            </Select>

            <Input
              label="Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EBE9E1]">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
            >
              Assign Task
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
