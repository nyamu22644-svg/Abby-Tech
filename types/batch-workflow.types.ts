// Comprehensive type definitions for egg batch traceability module
// Extends the auto-generated database types with domain-specific types

export interface BatchSupplierInfo {
  supplierId?: string;
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  location?: string;
  invoiceNumber?: string;
}

export interface BatchReceptionInfo {
  dateReceived: Date;
  receivedBy?: string; // user_id when selected from staff list
  receivedByName: string; // typed operational receiver name
  breedType: string;
  totalEggsReceived: number;
  notes?: string;
}

export interface BatchInspectionData {
  crackedEggs: number;
  dirtyEggs: number;
  rejectedEggs: number;
  acceptedEggs?: number; // auto-calculated
  inspectionNotes?: string;
  inspectionStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  inspectionCompletedAt?: Date;
  photosAttached?: string[]; // file IDs
}

export interface BatchFinancialCosts {
  eggPurchaseCost: number;
  transportCost: number;
  loadingOffloadingCost: number;
  miscellaneousCost: number;
  totalAcquisitionCost?: number; // auto-calculated
  costPerAcceptedEgg?: number; // auto-calculated
}

export interface BatchIncubationAssignment {
  incubatorId: string;
  incubatorName?: string;
  setDate: Date;
  expectedHatchDate: Date;
  responsibleTechnician?: string; // user_id
  responsibleTechnicianName?: string;
  startColumnNumber?: number; // physical incubator unit/rack
  startRowNumber?: number; // tray inside the unit/rack
  assignmentNotes?: string;
  autoAllocate?: boolean;
  placementSummary?: string;
  allocations?: BatchIncubatorAllocationDraft[];
}

export interface BatchIncubatorAllocationDraft {
  columnNumber: number;
  rowNumber: number;
  slotCapacity: number;
  eggsAllocated: number;
}

export interface CompleteBatchWorkflow {
  // Supplier (Step 1)
  supplier: BatchSupplierInfo;
  
  // Reception (Step 2)
  reception: BatchReceptionInfo;
  
  // Inspection (Step 3)
  inspection: BatchInspectionData;
  
  // Costs (Step 4)
  costs: BatchFinancialCosts;
  
  // Incubation Assignment (Step 5 - Optional)
  incubationAssignment?: BatchIncubationAssignment;
  
  // System-generated fields
  batchNumber?: string;
  batchId?: string;
  createdAt?: Date;
}

// API request/response types
export interface CreateBatchRequest {
  workflow: CompleteBatchWorkflow;
}

export interface CreateBatchResponse {
  success: boolean;
  batchId: string;
  batchNumber: string;
  message?: string;
  error?: string;
}

export interface BatchDetailResponse {
  id: string;
  batchNumber: string;
  tenantId: string;
  
  // Supplier info
  supplierId?: string;
  contactPerson?: string;
  supplierPhone?: string;
  supplierLocation?: string;
  invoiceNumber?: string;
  
  // Reception info
  dateReceived?: Date;
  receivedBy?: string;
  breedType?: string;
  
  // Inspection info
  quantityReceived: number;
  crackedEggs: number;
  dirtyEggs: number;
  rejectedEggs: number;
  acceptedEggs?: number;
  inspectionStatus: string;
  inspectionCompletedAt?: Date;
  inspectionNotes?: string;
  
  // Financial info
  eggPurchaseCost: number;
  transportCost: number;
  loadingOffloadingCost: number;
  miscInitialCost: number;
  totalInitialCost: number;
  costPerAcceptedEgg?: number;
  
  // Incubation info
  incubatorId?: string;
  responsibleTechnician?: string;
  setDate?: Date;
  expectedHatchDate?: Date;
  
  // Status
  status: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchInspectionRecord {
  id: string;
  batchId: string;
  crackedEggs: number;
  dirtyEggs: number;
  rejectedEggs: number;
  acceptedEggs: number;
  inspectionNotes?: string;
  inspectedBy: string;
  inspectedAt: Date;
}

export interface BatchAttachment {
  id: string;
  batchId: string;
  attachmentType: 'INVOICE' | 'INSPECTION_PHOTO' | 'DOCUMENT' | 'OTHER';
  fileName: string;
  fileSizeBytes?: number;
  mimeType?: string;
  storagePath: string;
  uploadedBy: string;
  uploadedAt: Date;
  description?: string;
}

export interface BatchIncubationAssignmentRecord {
  id: string;
  batchId: string;
  incubatorId: string;
  responsibleTechnician?: string;
  setDate: Date;
  expectedHatchDate: Date;
  assignmentNotes?: string;
  assignedBy: string;
  assignedAt: Date;
  actualSetDate?: Date;
  status: 'ASSIGNED' | 'TRANSFERRED' | 'COMPLETED' | 'CANCELLED';
}

export interface BatchAcquisitionCost {
  id: string;
  batchId: string;
  costType: 'EGG_PURCHASE' | 'TRANSPORT' | 'LOADING_OFFLOADING' | 'MISCELLANEOUS';
  amount: number;
  currency: string;
  description?: string;
  costDate: Date;
  recordedBy: string;
  recordedAt: Date;
}
