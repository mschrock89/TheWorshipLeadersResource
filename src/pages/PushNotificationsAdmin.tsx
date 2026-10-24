import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Bell, Plus, Trash2, Search, ArrowLeft, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCapabilities } from "@/hooks/useCapabilities";
import { CAPABILITIES } from "@/lib/capabilities";
import {
  describeWhen,
  extractTemplateKeys,
  fillerFor,
  missingFillers,
  splitPushTemplate,
  uniqueKeys,
} from "@/lib/pushMessageTemplate";
import {
  PUSH_CATEGORIES,
  useDeletePushDefinition,
  usePushDefinitions,
  useRecentPushLogs,
  useTogglePushDefinitionEnabled,
  useUpsertPushDefinition,
  type PushDefinitionRow,
} from "@/hooks/usePushNotificationsAdmin";

function NotAuthorized() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">Push Notifications</h1>
      <p className="mt-2 text-muted-foreground">You don't have access to manage push notifications.</p>
    </div>
  );
}

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type EditorState = {
  key: string;
  label: string;
  category: string;
  description: string;
  trigger_description: string;
  recipients_description: string;
  title_template: string;
  body_template: string;
  deep_link_url: string;
  template_variables: string[];
  enabled: boolean;
  content_from_db: boolean;
  is_system: boolean;
  sort_order: number;
};

function emptyEditor(category = "Custom"): EditorState {
  return {
    key: "",
    label: "",
    category,
    description: "",
    trigger_description: "",
    recipients_description: "",
    title_template: "",
    body_template: "",
    deep_link_url: "",
    template_variables: [],
    enabled: true,
    content_from_db: false,
    is_system: false,
    sort_order: 500,
  };
}

function fromRow(row: PushDefinitionRow): EditorState {
  return {
    key: row.key,
    label: row.label,
    category: row.category,
    description: row.description || "",
    trigger_description: row.trigger_description || "",
    recipients_description: row.recipients_description || "",
    title_template: row.title_template,
    body_template: row.body_template,
    deep_link_url: row.deep_link_url || "",
    template_variables: row.template_variables || [],
    enabled: row.enabled,
    content_from_db: row.content_from_db,
    is_system: row.is_system,
    sort_order: row.sort_order,
  };
}

function FilledText({ template, className }: { template: string; className?: string }) {
  const parts = splitPushTemplate(template);
  if (parts.length === 0) {
    return <span className={className}>Write a message…</span>;
  }
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.type === "text" ? (
          <span key={index}>{part.value}</span>
        ) : (
          <span
            key={index}
            className="whitespace-nowrap rounded bg-primary/15 px-0.5 text-primary"
            title={fillerFor(part.key).detail}
          >
            {fillerFor(part.key).sample}
          </span>
        ),
      )}
    </span>
  );
}

function NotificationPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-muted/40 p-3">
      <div className="rounded-xl border bg-background p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Bell className="h-3 w-3" />
          </span>
          App · now
        </div>
        <p className="text-sm font-semibold leading-snug text-foreground">
          <FilledText template={title || "Title"} />
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          <FilledText template={body || "Message"} />
        </p>
      </div>
    </div>
  );
}

function TokenField({
  value,
  onChange,
  onFocus,
  rows,
  placeholder,
  inputRef,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  rows: number;
  placeholder: string;
  inputRef: RefObject<HTMLTextAreaElement>;
  autoFocus?: boolean;
}) {
  const highlighted = splitPushTemplate(value);
  return (
    <div className="grid rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <div
        aria-hidden
        className="pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap break-words px-3 py-2 text-sm leading-6 text-foreground"
      >
        {value ? (
          highlighted.map((part, index) =>
            part.type === "text" ? (
              <span key={index}>{part.value}</span>
            ) : (
              <span key={index} className="rounded-sm bg-primary/20 text-primary">
                {`{{${part.key}}}`}
              </span>
            ),
          )
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        {value.endsWith("\n") ? "\n" : ""}
      </div>
      <textarea
        ref={inputRef}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        className="col-start-1 row-start-1 w-full resize-y bg-transparent px-3 py-2 text-sm leading-6 text-transparent caret-foreground outline-none"
        style={{ WebkitTextFillColor: "transparent" }}
        spellCheck={false}
      />
    </div>
  );
}

function MessageEditor({
  initial,
  isNew,
  open,
  onClose,
}: {
  initial: EditorState;
  isNew: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [advancedOpen, setAdvancedOpen] = useState(isNew);
  const [activeField, setActiveField] = useState<"title" | "body">("body");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const message = bodyRef.current;
    if (!message) return;
    const end = message.value.length;
    message.setSelectionRange(end, end);
  }, []);
  const upsert = useUpsertPushDefinition();
  const remove = useDeletePushDefinition();

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const fillerKeys = useMemo(() => {
    const found = extractTemplateKeys(
      `${form.title_template}\n${form.body_template}\n${form.deep_link_url}`,
    );
    const starters = isNew ? ["name", "date", "campus", "team", "position"] : [];
    return uniqueKeys([...form.template_variables, ...found, ...starters]).filter(
      (key) => key !== "set_id" && key !== "original_url",
    );
  }, [form.template_variables, form.title_template, form.body_template, form.deep_link_url, isNew]);

  const dropped = missingFillers(
    [form.title_template, form.body_template],
    initial.template_variables,
  );

  const insertFiller = (key: string) => {
    const token = `{{${key}}}`;
    const field = activeField;
    const current = field === "title" ? form.title_template : form.body_template;
    const element = field === "title" ? titleRef.current : bodyRef.current;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    const prefix = current.slice(0, start);
    const suffix = current.slice(end);
    const needsSpaceBefore = prefix.length > 0 && !/\s$/.test(prefix);
    const needsSpaceAfter = suffix.length > 0 && !/^\s/.test(suffix);
    const insertion = `${needsSpaceBefore ? " " : ""}${token}${needsSpaceAfter ? " " : ""}`;
    const next = prefix + insertion + current.slice(end);
    set(field === "title" ? "title_template" : "body_template", next);
    const cursor = start + insertion.length;
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(cursor, cursor);
    });
  };

  const canSave =
    form.key.trim().length > 0 &&
    form.label.trim().length > 0 &&
    form.category.trim().length > 0 &&
    form.title_template.trim().length > 0 &&
    form.body_template.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "New notification" : `Edit ${initial.label}`}</DialogTitle>
          <DialogDescription>
            Write the title and message people receive. Highlighted details — names, dates, and roles — fill in for each person.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            {isNew && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="push-name">Name</Label>
                  <Input
                    id="push-name"
                    value={form.label}
                    onChange={(event) => {
                      const label = event.target.value;
                      set("label", label);
                      if (!form.is_system) set("key", slugifyKey(label));
                    }}
                    placeholder="Weekend reminder"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(value) => set("category", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUSH_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="push-title">Title</Label>
              <TokenField
                inputRef={titleRef}
                value={form.title_template}
                onChange={(value) => set("title_template", value)}
                onFocus={() => setActiveField("title")}
                rows={2}
                placeholder="You're serving"
              />
            </div>

            <div>
              <Label htmlFor="push-body">Message</Label>
              <TokenField
                inputRef={bodyRef}
                value={form.body_template}
                onChange={(value) => set("body_template", value)}
                onFocus={() => setActiveField("body")}
                rows={4}
                autoFocus
                placeholder="You're on {{positions}} this weekend."
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Colored words stay in the message and get replaced when it sends. Tap one to drop it into the {activeField === "title" ? "title" : "message"}.
              </p>
              {fillerKeys.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {fillerKeys.map((key) => {
                    const filler = fillerFor(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                        onClick={() => insertFiller(key)}
                        title={filler.detail}
                      >
                        {filler.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {dropped.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="font-medium text-foreground">A detail was removed from this message.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {dropped.map((key) => (
                      <Button key={key} type="button" size="sm" variant="outline" onClick={() => insertFiller(key)}>
                        Put {fillerFor(key).label} back
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <NotificationPreview title={form.title_template} body={form.body_template} />
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground">When: </span>
                {describeWhen(form.key, form.trigger_description)}
              </p>
              <p>
                <span className="text-foreground">Who: </span>
                {form.recipients_description || "The people this notification is for"}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {form.content_from_db
                ? "Saving updates the message people already receive."
                : "People still get the original wording. Saving switches this notification to the message above."}
            </p>
          </div>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            Details
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>What this is for</Label>
              <Textarea
                value={form.description}
                rows={2}
                onChange={(event) => set("description", event.target.value)}
              />
            </div>
            <div>
              <Label>When it sends</Label>
              <Textarea
                value={form.trigger_description}
                rows={2}
                onChange={(event) => set("trigger_description", event.target.value)}
              />
            </div>
            <div>
              <Label>Who receives it</Label>
              <Textarea
                value={form.recipients_description}
                rows={2}
                onChange={(event) => set("recipients_description", event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Opens this page</Label>
              <Input
                value={form.deep_link_url}
                onChange={(event) => set("deep_link_url", event.target.value)}
                placeholder="/calendar"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <DialogFooter className="gap-2 sm:items-center">
          {!form.is_system && !isNew && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(form.key, { onSuccess: onClose })}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canSave || upsert.isPending}
            onClick={() =>
              upsert.mutate(
                {
                  key: form.key,
                  label: form.label,
                  category: form.category,
                  description: form.description,
                  trigger_description: form.trigger_description,
                  recipients_description: form.recipients_description,
                  title_template: form.title_template,
                  body_template: form.body_template,
                  deep_link_url: form.deep_link_url,
                  template_variables: uniqueKeys([
                    ...initial.template_variables,
                    ...extractTemplateKeys(`${form.title_template}\n${form.body_template}\n${form.deep_link_url}`),
                  ]),
                  enabled: form.enabled,
                  content_from_db: true,
                  is_system: form.is_system,
                  sort_order: form.sort_order,
                },
                { onSuccess: onClose },
              )
            }
          >
            {upsert.isPending ? "Saving…" : "Save message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogTab() {
  const { data: definitions = [], isLoading } = usePushDefinitions();
  const toggle = useTogglePushDefinitionEnabled();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [isNew, setIsNew] = useState(false);

  const categories = useMemo(() => {
    const present = new Set(definitions.map((row) => row.category));
    const ordered = PUSH_CATEGORIES.filter((name) => present.has(name));
    for (const name of present) {
      if (!ordered.includes(name as (typeof PUSH_CATEGORIES)[number])) ordered.push(name as (typeof PUSH_CATEGORIES)[number]);
    }
    return ordered;
  }, [definitions]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return definitions.filter((row) => {
      if (category !== "all" && row.category !== category) return false;
      if (!query) return true;
      return (
        row.label.toLowerCase().includes(query) ||
        row.key.toLowerCase().includes(query) ||
        (row.description || "").toLowerCase().includes(query) ||
        row.title_template.toLowerCase().includes(query) ||
        row.body_template.toLowerCase().includes(query)
      );
    });
  }, [definitions, search, category]);

  const grouped = useMemo(() => {
    const map = new Map<string, PushDefinitionRow[]>();
    for (const row of filtered) {
      const list = map.get(row.category) || [];
      list.push(row);
      map.set(row.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const openEditor = (row: PushDefinitionRow) => {
    setIsNew(false);
    setEditing(fromRow(row));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Each card is the notification someone gets. Edit the wording, and leave the highlighted details so names and dates still fill in.
        </p>
        <Button
          onClick={() => {
            setIsNew(true);
            setEditing(emptyEditor(category !== "all" ? category : "Custom"));
          }}
        >
          <Plus className="h-4 w-4" />
          Add notification
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search notifications"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={category === "all" ? "default" : "outline"}
          onClick={() => setCategory("all")}
        >
          All
        </Button>
        {categories.map((name) => (
          <Button
            key={name}
            size="sm"
            variant={category === name ? "default" : "outline"}
            onClick={() => setCategory(name)}
          >
            {name}
          </Button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading notifications…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No notifications match that search.</p>
      )}

      {grouped.map(([group, rows]) => (
        <section key={group} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{group}</h2>
          <div className="grid gap-3">
            {rows.map((row) => (
              <article
                key={row.key}
                className={`rounded-xl border bg-card p-4 ${row.enabled ? "" : "opacity-60"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{row.label}</h3>
                      {!row.is_system && <Badge variant="outline">Custom</Badge>}
                      {row.content_from_db && <Badge variant="secondary">Your wording</Badge>}
                    </div>
                    {row.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">{row.enabled ? "On" : "Off"}</span>
                    <Switch
                      checked={row.enabled}
                      disabled={toggle.isPending}
                      onCheckedChange={(enabled) => toggle.mutate({ key: row.key, enabled })}
                      aria-label={`${row.enabled ? "Turn off" : "Turn on"} ${row.label}`}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="mt-4 w-full text-left"
                  onClick={() => openEditor(row)}
                >
                  <NotificationPreview title={row.title_template} body={row.body_template} />
                </button>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <p className="max-w-xl text-sm text-muted-foreground">
                    {describeWhen(row.key, row.trigger_description)}
                    {row.recipients_description ? ` · ${row.recipients_description}` : ""}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => openEditor(row)}>
                    Edit message
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <MessageEditor
          key={`${editing.key}-${isNew}`}
          initial={editing}
          isNew={isNew}
          open
          onClose={() => {
            setEditing(null);
            setIsNew(false);
          }}
        />
      )}
    </div>
  );
}

function RecentTab() {
  const { data: logs = [], isLoading } = useRecentPushLogs();
  const { data: definitions = [] } = usePushDefinitions();
  const labelFor = (key: string | null) =>
    (key && definitions.find((row) => row.key === key)?.label) || key || "Notification";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">The latest notifications that went out.</p>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && logs.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing has been sent yet.</p>
      )}
      {logs.map((log) => (
        <article key={log.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {new Date(log.created_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {" · "}
              {labelFor(log.context_type)}
            </p>
            {log.canceled_at ? (
              <Badge variant="destructive">Withdrawn</Badge>
            ) : (
              <Badge variant="secondary">Sent</Badge>
            )}
          </div>
          <p className="mt-2 font-medium text-foreground">{log.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{log.message}</p>
        </article>
      ))}
    </div>
  );
}

export default function PushNotificationsAdmin() {
  const { can, isLoading } = useCapabilities();

  if (isLoading) {
    return <div className="px-4 py-16 text-center text-muted-foreground">Loading…</div>;
  }
  if (!can(CAPABILITIES.MANAGE_PERMISSIONS) && !can(CAPABILITIES.ADMIN_TOOLS) && !can(CAPABILITIES.ADMIN_FULL)) {
    return <NotAuthorized />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Button asChild variant="ghost" className="mb-4 -ml-2 gap-2 text-muted-foreground hover:text-foreground">
        <Link to="/admin-tools">
          <ArrowLeft className="h-4 w-4" />
          Back to Admin Tools
        </Link>
      </Button>
      <div className="mb-6 flex items-center gap-2">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="font-display text-3xl font-bold text-foreground">Push Notifications</h1>
      </div>
      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Messages</TabsTrigger>
          <TabsTrigger value="recent">Recent sends</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="mt-4">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="recent" className="mt-4">
          <RecentTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
