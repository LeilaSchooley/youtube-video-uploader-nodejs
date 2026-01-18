# Dashboard Refactoring Plan

The dashboard page (`app/dashboard/page.tsx`) is currently 4397 lines, which is too large. This document outlines the refactoring plan to split it into manageable components.

## Components to Extract

1. **`components/dashboard/Header.tsx`** (~100 lines)
   - User profile display
   - Channel selector
   - Dark mode toggle
   - Debug panel toggle
   - Logout/Delete account buttons

2. **`components/dashboard/Statistics.tsx`** (~200 lines)
   - Statistics dashboard
   - Job counts (total, completed, processing, pending, failed)
   - Remaining videos counter

3. **`components/dashboard/UploadForms.tsx`** (~1500 lines)
   - Single video upload form
   - ZIP asset upload form
   - CSV batch upload form
   - Bulk upload form (Step 1)
   - Metadata update form (Step 2)

4. **`components/dashboard/ProgressDisplays.tsx`** (~500 lines)
   - Bulk upload progress display
   - Metadata update progress display
   - CSV upload progress display
   - ZIP upload progress display

5. **`components/dashboard/QueueManagement.tsx`** (~800 lines)
   - Job queue list
   - Job details panel
   - Job status display
   - Job action buttons (pause, resume, cancel, delete)

6. **`components/dashboard/FileManagement.tsx`** (~600 lines)
   - All uploaded files section
   - File listings by category (videos, thumbnails, CSVs)
   - File deletion functionality
   - Job file details

7. **`hooks/useDashboardData.ts`** (~400 lines)
   - Data fetching hooks
   - Queue management
   - File management
   - Channel management

8. **`hooks/useUploadHandlers.ts`** (~500 lines)
   - Upload handler functions
   - CSV validation
   - Progress tracking

## Benefits

- **Maintainability**: Each component has a single responsibility
- **Readability**: Smaller files are easier to understand
- **Reusability**: Components can be reused or tested independently
- **Performance**: Better code splitting and lazy loading opportunities

## Implementation Order

1. Create types file (✅ Done)
2. Extract Header component
3. Extract Statistics component
4. Extract UploadForms component (largest impact)
5. Extract ProgressDisplays component
6. Extract QueueManagement component
7. Extract FileManagement component
8. Extract custom hooks
9. Update main dashboard to use all components

## Estimated File Sizes After Refactoring

- `app/dashboard/page.tsx`: ~500-800 lines (down from 4397)
- `components/dashboard/Header.tsx`: ~100 lines
- `components/dashboard/Statistics.tsx`: ~200 lines
- `components/dashboard/UploadForms.tsx`: ~1500 lines
- `components/dashboard/ProgressDisplays.tsx`: ~500 lines
- `components/dashboard/QueueManagement.tsx`: ~800 lines
- `components/dashboard/FileManagement.tsx`: ~600 lines
- `hooks/useDashboardData.ts`: ~400 lines
- `hooks/useUploadHandlers.ts`: ~500 lines


