import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Client {
  id: string;
  name: string;
  legalEntity: "Pvt Ltd" | "LLP" | "Proprietorship" | "Individual";
  pan: string;
  gstin: string;
  email: string;
  phone: string;
  complianceScore: number;
  assignedTo: string;
  status: "Active" | "Notice Received" | "Onboarding";
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  gstin: string;
  issueDate: string;
  dueDate: string;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  status: "Paid" | "Pending" | "Overdue";
}

export interface Task {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  category: "GST Filing" | "Income Tax" | "Statutory Audit" | "TDS & Payroll";
  priority: "High" | "Medium" | "Urgent";
  assignedTo: string;
  approver: string;
  dueDate: string;
  status: "In Progress" | "Pending Approval" | "Approved" | "Overdue";
}

interface PracticeStore {
  clients: Client[];
  invoices: Invoice[];
  tasks: Task[];
  addClient: (client: Omit<Client, "id">) => void;
  addInvoice: (invoice: Omit<Invoice, "id" | "invoiceNumber">) => void;
  updateInvoiceStatus: (id: string, status: Invoice["status"]) => void;
  addTask: (task: Omit<Task, "id">) => void;
  updateTaskStatus: (id: string, status: Task["status"]) => void;
}

export const usePracticeStore = create<PracticeStore>()(
  persist(
    (set, get) => ({
      clients: [
        {
          id: "cl-1",
          name: "Zenith Retailers LLP",
          legalEntity: "LLP",
          pan: "AAACZ1234F",
          gstin: "09AAACZ1234F1Z5",
          email: "rohit@zenithretail.com",
          phone: "+91 98390 11223",
          complianceScore: 98,
          assignedTo: "CA Priya Kulkarni",
          status: "Active",
        },
        {
          id: "cl-2",
          name: "Apex Logistics Ltd",
          legalEntity: "Pvt Ltd",
          pan: "AABCA5678G",
          gstin: "09AABCA5678G2Z1",
          email: "finance@apexlogistics.in",
          phone: "+91 94150 44556",
          complianceScore: 74,
          assignedTo: "Rishabh Shukla",
          status: "Notice Received",
        },
        {
          id: "cl-3",
          name: "Nova Tech Solutions",
          legalEntity: "Pvt Ltd",
          pan: "AABCN9921E",
          gstin: "09AABCN9921E1Z3",
          email: "accounts@novatech.co",
          phone: "+91 97920 88990",
          complianceScore: 94,
          assignedTo: "CA Priya Kulkarni",
          status: "Active",
        },
      ],
      invoices: [
        {
          id: "inv-1",
          invoiceNumber: "TRUV/26-27/0891",
          clientId: "cl-1",
          clientName: "Zenith Retailers LLP",
          gstin: "09AAACZ1234F1Z5",
          issueDate: "2026-10-01",
          dueDate: "2026-10-15",
          taxableAmount: 45000,
          gstAmount: 8100,
          totalAmount: 53100,
          status: "Pending",
        },
        {
          id: "inv-2",
          invoiceNumber: "TRUV/26-27/0890",
          clientId: "cl-2",
          clientName: "Apex Logistics Ltd",
          gstin: "09AABCA5678G2Z1",
          issueDate: "2026-09-28",
          dueDate: "2026-10-05",
          taxableAmount: 80000,
          gstAmount: 14400,
          totalAmount: 94400,
          status: "Overdue",
        },
      ],
      tasks: [
        {
          id: "tsk-1",
          title: "GSTR-3B Computation & ITC Cross-Match",
          clientId: "cl-2",
          clientName: "Apex Logistics Ltd",
          category: "GST Filing",
          priority: "Urgent",
          assignedTo: "Rishabh Shukla",
          approver: "CA Priya Kulkarni",
          dueDate: "2026-10-20",
          status: "Pending Approval",
        },
        {
          id: "tsk-2",
          title: "Form 3CD Annexures Final Review",
          clientId: "cl-1",
          clientName: "Zenith Retailers LLP",
          category: "Statutory Audit",
          priority: "High",
          assignedTo: "Arjun Kanojiya",
          approver: "CA Priya Kulkarni",
          dueDate: "2026-10-25",
          status: "In Progress",
        },
      ],
      addClient: (clientData) =>
        set((state) => ({
          clients: [
            { ...clientData, id: `cl-${Date.now()}` },
            ...state.clients,
          ],
        })),
      addInvoice: (invoiceData) => {
        const nextNum = get().invoices.length + 892;
        set((state) => ({
          invoices: [
            {
              ...invoiceData,
              id: `inv-${Date.now()}`,
              invoiceNumber: `TRUV/26-27/0${nextNum}`,
            },
            ...state.invoices,
          ],
        }));
      },
      updateInvoiceStatus: (id, status) =>
        set((state) => ({
          invoices: state.invoices.map((inv) =>
            inv.id === id ? { ...inv, status } : inv
          ),
        })),
      addTask: (taskData) =>
        set((state) => ({
          tasks: [
            { ...taskData, id: `tsk-${Date.now()}` },
            ...state.tasks,
          ],
        })),
      updateTaskStatus: (id, status) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id ? { ...t, status } : t
          ),
        })),
    }),
    {
      name: "truv-ledgeros-store",
    }
  )
);