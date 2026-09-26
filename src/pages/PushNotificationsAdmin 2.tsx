import { useMemo, useState } from "react";
import { Bell, Plus, Trash2, Pencil, Search, ArrowLeft, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCapabilities } from "@/hooks/useCapabilities";
import { CAPABILITIES } from "@/lib/capabilities";
import {
  PUSH_CATEGORIES,
  parseTemplateVariables,
  renderPushTemplate,
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
  template_variables: string;
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
    template_variables: "",
    enabled: true,
    content_from_db: true,
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
    template_variables: (row.template_variables || []).join(", "),
    enabled: row.enabled,
    content_from_db: row.content_from_db,
    is_system: row.is_system,
    sort_order: row.sort_order,
  };
}

function PreviewPhone({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-muted/40 p-3 shadow-sm">
      <div className="rounded-xl bg-background p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Bell className="h-3 w-3" />
          </span>
          App · now
        </div>
        <p className="text-sm font-semibold leading-snug text-foreground">{title || "Title"}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{body || "Message body"}</p>
      </div>
    </div>
  );
}

function EditorPanel({
  initial,
  isNew,
  onClose,
}: {
  initial: EditorState;
  isNew: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const upsert = useUpsertPushDefinition();
  const remove = useDeletePushDefinition();

  const sampleVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const key of parseTemplateVariables(form.template_variables)) {
      vars[key] = sampleValue(key);
    }
    // Also pick up any placeholders present in templates but not listed.
    const found = new Set<string>();
    const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    for (const text of [form.title_template, form.body_template, form.deep_link_url]) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(text))) found.add(match[1]);
    }
    for (const key of found) {
      if (!(key in vars)) vars[key] = sampleValue(key);
    }
    return vars;
  }, [form.template_variables, form.title_template, form.body_template, form.deep_link_url]);

  const previewTitle = renderPushTemplate(form.title_template, sampleVars);
  const previewBody = renderPushTemplate(form.body_template, sampleVars);

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSave =
    form.key.trim().length > 0 &&
    form.label.trim().length > 0 &&
    form.category.trim().length > 0 &&
    form.title_template.trim().length > 0 &&
    form.body_template.trim().length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{isNew ? "Add push notification" : `Edit: ${initial.label}`}</CardTitle>
            <CardDescription className="mt-1">
              Use {"{{variable}}"} placeholders for dynamic text. Turn on “Use these templates live” when you want
              sends to use this copy.
            </CardDescription>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={form.label}
                onChange={(e) => {
                  const label = e.target.value;
                  set("label", label);
                  if (isNew && !form.is_system) set("key", slugifyKey(label));
                }}
                placeholder="e.g. Setlist Posted"
              />
            </div>
            <div>
              <Label>Key</Label>
              <Input
                value={form.key}
                disabled={!isNew || form.is_system}
                onChange={(e) => set("key", slugifyKey(e.target.value))}
                placeholder="setlist-published"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Matches the send path <code className="rounded bg-muted px-1">contextType</code>. System keys can’t
                change.
              </p>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PUSH_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  {!PUSH_CATEGORIES.includes(form.category as (typeof PUSH_CATEGORIES)[number]) && form.category && (
                    <SelectItem value={form.category}>{form.category}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="What this push is for"
              />
            </div>
            <div>
              <Label>When it sends</Label>
              <Textarea
                value={form.trigger_description}
                onChange={(e) => set("trigger_description", e.target.value)}
                rows={2}
                placeholder="e.g. Publishing a setlist"
              />
            </div>
            <div>
              <Label>Who receives it</Label>
              <Textarea
                value={form.recipients_description}
                onChange={(e) => set("recipients_description", e.target.value)}
                rows={2}
                placeholder="e.g. Setlist roster"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Title template</Label>
              <Input
                value={form.title_template}
                onChange={(e) => set("title_template", e.target.value)}
                placeholder="Setlist Posted"
              />
            </div>
            <div>
              <Label>Body template</Label>
              <Textarea
                value={form.body_template}
                onChange={(e) => set("body_template", e.target.value)}
                rows={3}
                placeholder="{{song_count}} songs for {{date}} at {{campus}}"
              />
            </div>
            <div>
              <Label>Deep link</Label>
              <Input
                value={form.deep_link_url}
                onChange={(e) => set("deep_link_url", e.target.value)}
                placeholder="/my-setlists"
              />
            </div>
            <div>
              <Label>Variables</Label>
              <Input
                value={form.template_variables}
                onChange={(e) => set("template_variables", e.target.value)}
                placeholder="date, campus, song_count"
              />
              <p className="mt-1 text-xs text-muted-foreground">Comma-separated. Used for docs and preview samples.</p>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Enabled</p>
                  <p className="text-xs text-muted-foreground">Off = this push type will not send.</p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
              </div>
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <div>
                  <p className="text-sm font-medium">Use these templates live</p>
                  <p className="text-xs text-muted-foreground">
                    When on, title/body come from this form (with {"{{vars}}"} filled at send time).
                  </p>
                </div>
                <Switch checked={form.content_from_db} onCheckedChange={(v) => set("content_from_db", v)} />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Preview</Label>
              <PreviewPhone title={previewTitle} body={previewBody} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
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
                  template_variables: parseTemplateVariables(form.template_variables),
                  enabled: form.enabled,
                  content_from_db: form.content_from_db,
                  is_system: form.is_system,
                  sort_order: form.sort_order,
                },
                { onSuccess: () => onClose() },
              )
            }
          >
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!form.is_system && !isNew && (
            <Button
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(form.key, { onSuccess: () => onClose() })}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function sampleValue(key: string): string {
  const samples: Record<string, string> = {
    song_count: "4",
    date: "Jul 12",
    campus: "Frisco",
    set_id: "abc123",
    name: "Alex",
    track_title: "Praise",
    day_word: "today",
    day_word_title: "Today",
    positions: "Electric Guitar",
    teams: "Team A",
    team: "Team A",
    ministry: "Production",
    date_range: "Jul 12–13",
    dates: "Jul 12, Jul 19",
    request_label: "Cover Request",
    requester: "Jordan",
    accepter: "Sam",
    position: "Drums",
    sender: "Taylor",
    chat_label: "Frisco Worship",
    preview: "Can someone cover Saturday?",
    author: "Morgan",
    title_preview: "Practice notes",
    title: "Team Night",
    time: " at 7:00 PM",
    period: "Fall Trimester",
    request_phrase: "needs a break",
    count: "12",
    message: "Don’t forget call time!",
    original_title: "Setlist Posted",
    original_url: "/my-setlists",
  };
  return samples[key] || key.replace(/_/g, " ");
}

function CatalogTab() {
  const { data: definitions = [], isLoading } = usePushDefinitions();
  const toggle = useTogglePushDefinitionEnabled();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [isNew, setIsNew] = useState(false);

  const categories = useMemo(() => {
    const set = new Set(definitions.map((d) => d.category));
    return Array.from(set).sort();
  }, [definitions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return definitions.filter((d) => {
      if (category !== "all" && d.category !== category) return false;
      if (!q) return true;
      return (
        d.label.toLowerCase().includes(q) ||
        d.key.toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q) ||
        (d.trigger_description || "").toLowerCase().includes(q)
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

  if (editing) {
    return (
      <EditorPanel
        initial={editing}
        isNew={isNew}
        onClose={() => {
          setEditing(null);
          setIsNew(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>All push notifications</CardTitle>
              <CardDescription>
                Every push the app can send. Toggle off to pause, or edit title/body and details.
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setIsNew(true);
                setEditing(emptyEditor());
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add new
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by name, key, or trigger…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Disabling a type stops it immediately. Editing copy is saved here; turn on{" "}
              <span className="font-medium text-foreground">Use these templates live</span> in the editor for title/body
              to come from this page when that push sends.
            </p>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No push notifications match your filters.</p>
          )}

          {grouped.map(([group, rows]) => (
            <div key={group} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{group}</h3>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Notification</TableHead>
                      <TableHead className="min-w-[200px]">When / Who</TableHead>
                      <TableHead className="min-w-[200px]">Copy</TableHead>
                      <TableHead className="w-[90px]">On</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.key} className={!row.enabled ? "opacity-60" : undefined}>
                        <TableCell>
                          <div className="font-medium">{row.label}</div>
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">{row.key}</div>
                          {row.description && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{row.description}</p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {row.is_system ? (
                              <Badge variant="secondary">System</Badge>
                            ) : (
                              <Badge variant="outline">Custom</Badge>
                            )}
                            {row.content_from_db && <Badge>Live templates</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          <p>
                            <span className="text-muted-foreground">When: </span>
                            {row.trigger_description || "—"}
                          </p>
                          <p className="mt-1">
                            <span className="text-muted-foreground">Who: </span>
                            {row.recipients_description || "—"}
                          </p>
                        </TableCell>
                        <TableCell className="align-top">
                          <p className="text-sm font-medium leading-snug">{row.title_template}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3">{row.body_template}</p>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={row.enabled}
                            disabled={toggle.isPending}
                            onCheckedChange={(enabled) => toggle.mutate({ key: row.key, enabled })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setIsNew(false);
                              setEditing(fromRow(row));
                            }}
                            aria-label={`Edit ${row.label}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RecentTab() {
  const { data: logs = [], isLoading } = useRecentPushLogs();
  const { data: definitions = [] } = usePushDefinitions();
  const labelFor = (key: string | null) =>
    (key && definitions.find((d) => d.key === key)?.label) || key || "Unknown";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sends</CardTitle>
        <CardDescription>Latest logged push deliveries (admin audit trail).</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && logs.length === 0 && (
          <p className="text-sm text-muted-foreground">No logged pushes yet.</p>
        )}
        {logs.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(log.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-sm">{labelFor(log.context_type)}</TableCell>
                    <TableCell className="font-medium">{log.title}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{log.message}</TableCell>
                    <TableCell>
                      {log.canceled_at ? (
                        <Badge variant="destructive">Withdrawn</Badge>
                      ) : (
                        <Badge variant="secondary">Sent</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
    <div className="mx-auto max-w-6xl px-4 py-8">
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
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
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
