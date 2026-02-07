
# Service Flow Feature Implementation Plan

## Overview
Create a "Service Flow" planning feature that allows worship leaders to build complete orders of service with timing, auto-populated songs from published setlists, and reusable campus/ministry templates.

---

## Feature Requirements Summary

Based on the reference image and your requirements:

1. **Item Types**:
   - **Header** - Section dividers (e.g., "PRE-SERVICE", "WORSHIP/ANNOUNCEMENTS", "SERMON", "POST-SERVICE")
   - **Item** - General service elements (e.g., "Pre-Roll Video", "Announcements", "Sermon", "Communion")
   - **Song** - Auto-populated from the scheduled setlist with key badges and vocalist names

2. **Auto-Population**: Songs automatically populate based on the matching published setlist for the same date, campus, and ministry

3. **Master Templates**: Reusable templates per campus and ministry that auto-generate when a setlist is published

4. **Duration Tracking**: Each item has an editable duration, with total time calculated at the bottom

5. **Drag-and-Drop Reordering**: Items can be reordered via drag handles

---

## Database Schema

### New Tables

**`service_flow_templates`** - Master templates for each campus/ministry combination
```text
- id (uuid, primary key)
- campus_id (uuid, foreign key -> campuses)
- ministry_type (text)
- name (text) - e.g., "Murfreesboro Central Weekend Template"
- created_by (uuid, foreign key -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)
- UNIQUE(campus_id, ministry_type)
```

**`service_flow_template_items`** - Items within a template
```text
- id (uuid, primary key)
- template_id (uuid, foreign key -> service_flow_templates)
- item_type (text) - 'header' | 'item' | 'song_placeholder'
- title (text) - e.g., "PRE-SERVICE", "Announcements", "Worship Songs"
- default_duration_seconds (integer, nullable)
- sequence_order (integer)
- created_at (timestamptz)
```

**`service_flows`** - Generated service flows for specific dates
```text
- id (uuid, primary key)
- draft_set_id (uuid, foreign key -> draft_sets)
- campus_id (uuid, foreign key -> campuses)
- ministry_type (text)
- service_date (date)
- created_from_template_id (uuid, nullable, foreign key -> service_flow_templates)
- created_by (uuid, foreign key -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)
- UNIQUE(campus_id, ministry_type, service_date)
```

**`service_flow_items`** - Individual items in a service flow
```text
- id (uuid, primary key)
- service_flow_id (uuid, foreign key -> service_flows)
- item_type (text) - 'header' | 'item' | 'song'
- title (text)
- duration_seconds (integer, nullable)
- sequence_order (integer)
- song_id (uuid, nullable, foreign key -> songs) - For song items
- song_key (text, nullable) - For song items
- vocalist_id (uuid, nullable, foreign key -> profiles) - For song items
- notes (text, nullable)
- created_at (timestamptz)
```

### RLS Policies
- Templates: Viewable by all authenticated users, editable by campus/network worship pastors
- Service Flows: Same access as draft_sets (tied to campus-based permissions)

---

## Component Architecture

### Pages
- **`/service-flow`** - Main Service Flow editor page (similar to SetPlanner)
- **`/service-flow/templates`** - Template management page

### Components

**`src/components/service-flow/ServiceFlowEditor.tsx`**
- Main editing interface
- Campus/ministry/date selectors
- Displays the ordered list of items
- Total duration calculation at bottom
- Add item button

**`src/components/service-flow/ServiceFlowItem.tsx`**
- Renders individual items based on type
- Drag handle for reordering
- Duration input (MM:SS format)
- Delete button
- Conditional rendering:
  - Headers: Dark background, bold uppercase text
  - Items: Standard row with title and duration
  - Songs: Title + key badge + vocalist name + attachment indicator

**`src/components/service-flow/AddItemDialog.tsx`**
- Dialog to add new items
- Radio selection for item type (Header, Item, Song)
- Title input for Headers/Items
- Duration input
- Song selector (filtered list) for Song type

**`src/components/service-flow/TemplateManager.tsx`**
- List of templates by campus/ministry
- Create/edit/delete template capabilities
- Preview template structure

**`src/components/service-flow/DurationInput.tsx`**
- Custom input for MM:SS format
- Converts to/from seconds for storage

### Hooks

**`src/hooks/useServiceFlow.tsx`**
- `useServiceFlow(campusId, ministryType, date)` - Fetch or create service flow
- `useServiceFlowItems(serviceFlowId)` - Fetch items with song details
- `useSaveServiceFlowItem()` - Add/update item
- `useDeleteServiceFlowItem()` - Remove item
- `useReorderServiceFlowItems()` - Batch reorder

**`src/hooks/useServiceFlowTemplates.tsx`**
- `useTemplates(campusId, ministryType)` - Fetch available templates
- `useTemplateItems(templateId)` - Fetch template items
- `useSaveTemplate()` - Create/update template
- `useDeleteTemplate()` - Remove template
- `useApplyTemplate()` - Copy template items to a service flow

---

## Auto-Generation Logic

When a setlist is published (in `useSaveDraftSet` or via publish flow):

1. Check if a `service_flow_templates` entry exists for the campus/ministry
2. If template exists:
   - Create a new `service_flows` entry for the date
   - Copy all template items to `service_flow_items`
   - For items with `item_type = 'song_placeholder'`, expand into actual songs from the published setlist
3. If no template exists:
   - Create a simple service flow with just the songs from the setlist

This logic can be implemented as:
- A database trigger on `draft_sets` when `status` changes to `'published'`
- Or a function called from the frontend publish flow

---

## UI/UX Design

### Service Flow Editor Layout
```text
+--------------------------------------------------+
|  [Campus Selector] [Ministry] [Date Picker]       |
+--------------------------------------------------+
| LENGTH    TITLE                                   |
+--------------------------------------------------+
| ::        PRE-SERVICE                     [dark] |
+--------------------------------------------------+
| ::  4:30  Pre-Roll Video                    [x]  |
+--------------------------------------------------+
| ::  4:59  Praise the Lord [C] - Tamara  [3] [x]  |
+--------------------------------------------------+
| ::        WORSHIP/ANNOUNCEMENTS           [dark] |
+--------------------------------------------------+
| ::  3:00  PSA Video                         [x]  |
+--------------------------------------------------+
| ::  5:00  Announcements                     [x]  |
+--------------------------------------------------+
| ::  6:03  Way Maker [C] - Nathan        [3] [x]  |
+--------------------------------------------------+
| ...                                              |
+--------------------------------------------------+
| [+]  91:06 total                                 |
+--------------------------------------------------+
```

### Item Type Visual Styling
- **Headers**: Dark background (`bg-muted`), uppercase text, no duration column, full-width
- **Items**: Standard row, editable duration, title
- **Songs**: Title + key badge (colored circle) + vocalist name + attachment count icon

---

## Implementation Phases

### Phase 1: Database Setup
1. Create migration for all 4 new tables
2. Add RLS policies matching existing patterns
3. Add foreign key relationships

### Phase 2: Core Hooks & Types
1. Create TypeScript interfaces for all entities
2. Implement `useServiceFlow` and `useServiceFlowItems` hooks
3. Implement CRUD mutation hooks

### Phase 3: Service Flow Editor
1. Build main `ServiceFlowEditor` component
2. Create `ServiceFlowItem` with type-specific rendering
3. Implement drag-and-drop reordering
4. Add duration input and total calculation
5. Create `AddItemDialog` for adding new items

### Phase 4: Template System
1. Build `TemplateManager` component
2. Implement template CRUD operations
3. Add "Apply Template" functionality

### Phase 5: Auto-Generation
1. Modify publish flow to trigger service flow generation
2. Implement template expansion logic (replacing song placeholders with actual songs)
3. Handle edge cases (re-publishing, template updates)

### Phase 6: Navigation & Polish
1. Add route `/service-flow` to `App.tsx`
2. Add navigation link (dropdown or sidebar)
3. Mobile-responsive adjustments
4. Loading states and error handling

---

## Technical Considerations

1. **Song Duration**: Songs table currently has `bpm` but no duration. Options:
   - Add `duration_seconds` column to `songs` table
   - Store duration only in service flow items (manual entry)
   - Calculate estimated duration from BPM (less accurate)

2. **Realtime Updates**: Consider enabling Supabase realtime on `service_flow_items` for collaborative editing

3. **Template Versioning**: When templates are updated, existing service flows are not affected (they were generated at publish time)

4. **Attachment Count**: The reference image shows an attachment icon with count. This would require:
   - A new `service_flow_item_attachments` table, OR
   - Using existing song attachments from audio library

---

## Files to Create/Modify

### New Files
- `src/pages/ServiceFlow.tsx`
- `src/pages/ServiceFlowTemplates.tsx`
- `src/components/service-flow/ServiceFlowEditor.tsx`
- `src/components/service-flow/ServiceFlowItem.tsx`
- `src/components/service-flow/AddItemDialog.tsx`
- `src/components/service-flow/DurationInput.tsx`
- `src/components/service-flow/TemplateManager.tsx`
- `src/hooks/useServiceFlow.tsx`
- `src/hooks/useServiceFlowTemplates.tsx`

### Modified Files
- `src/App.tsx` - Add new routes
- `src/lib/constants.ts` - Add service flow item types
- `src/pages/SetPlanner.tsx` or publish flow - Trigger auto-generation
- Database migration file

