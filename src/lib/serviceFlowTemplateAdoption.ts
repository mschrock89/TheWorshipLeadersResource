export type FlowShapeItem = {
  item_type: string;
  title: string;
  duration_seconds?: number | null;
};

export type TemplateShapeItem = {
  item_type: string;
  title: string;
  default_duration_seconds?: number | null;
  sequence_order?: number;
};

function isSongPlaceholder(item: { item_type?: string | null; title?: string | null }): boolean {
  if (item.item_type === "song_placeholder") return true;
  if (item.item_type === "header") return false;
  return /^song\s*\d+\b/i.test((item.title || "").trim());
}

function sameDuration(left: number | null | undefined, right: number | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

/**
 * True when the flow is still the generated copy of `templateItems`:
 * headers and plain items match, song placeholders may be real songs, and
 * extra setlist songs may trail the template. A renamed row or a changed
 * duration means someone edited the service and it should be left alone.
 */
export function flowMatchesTemplateShape(
  flowItems: FlowShapeItem[],
  templateItems: TemplateShapeItem[],
): boolean {
  let index = 0;
  for (const templateItem of templateItems) {
    const flowItem = flowItems[index];
    if (isSongPlaceholder(templateItem)) {
      if (!flowItem) return false;
      const filledWithSong = flowItem.item_type === "song";
      const keptPlaceholder =
        flowItem.item_type === "item" && flowItem.title === templateItem.title;
      if (!filledWithSong && !keptPlaceholder) return false;
      index += 1;
      continue;
    }

    if (!flowItem) return false;
    if (flowItem.item_type !== templateItem.item_type) return false;
    if (flowItem.title !== templateItem.title) return false;
    if (
      templateItem.item_type !== "header" &&
      !sameDuration(flowItem.duration_seconds, templateItem.default_duration_seconds)
    ) {
      return false;
    }
    index += 1;
  }

  for (let extra = index; extra < flowItems.length; extra += 1) {
    if (flowItems[extra].item_type !== "song") return false;
  }
  return true;
}

/**
 * A service flow can take a newly saved template when it has no rows yet,
 * when it was only the setlist (no template was applied), or when it is
 * still an unmodified copy of the template it was generated from.
 */
/**
 * Template rows whose sequence number is missing from a flow that still uses
 * the template's original order. A reordered or hand-built flow is left alone.
 * Renamed rows that kept their sequence number are not treated as missing.
 */
export function missingTemplateRows<T extends TemplateShapeItem & { sequence_order: number }>(
  flowItems: Array<{ sequence_order: number }>,
  templateItems: T[],
): T[] {
  if (flowItems.length === 0 || templateItems.length === 0) return [];
  const templateOrders = new Set(templateItems.map((item) => item.sequence_order));
  if (!flowItems.every((item) => templateOrders.has(item.sequence_order))) return [];
  const flowOrders = new Set(flowItems.map((item) => item.sequence_order));
  return templateItems.filter((item) => !flowOrders.has(item.sequence_order));
}

export function flowCanBeReplacedByTemplate(
  flowItems: FlowShapeItem[],
  sourceTemplateItems: TemplateShapeItem[] | null,
): boolean {
  if (flowItems.length === 0) return true;
  if (!sourceTemplateItems || sourceTemplateItems.length === 0) {
    return flowItems.every((item) => item.item_type === "song");
  }
  return flowMatchesTemplateShape(flowItems, sourceTemplateItems);
}
