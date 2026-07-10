import { useMemo, useState } from "react";
import { format, startOfWeek, subWeeks } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useCampuses } from "@/hooks/useCampuses";
import { getLeadableMinistryKeys } from "@/lib/hubAccess";
import { useMinistries, useServingRecords, useUpsertServingRecord } from "../hooks";

const CATEGORIES = [
  { value: "servers", label: "Servers" },
  { value: "attendance", label: "Attendance" },
];

function mostRecentSunday() {
  return format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");
}

export default function HubDashboard() {
  const { user } = useAuth();
  const { data: roles = [] } = useUserRoles(user?.id);
  const roleNames = roles.map((r) => r.role);
  const { data: ministries = [] } = useMinistries();
  const { data: campuses = [] } = useCampuses();
  const upsertRecord = useUpsertServingRecord();

  const leadableKeys = getLeadableMinistryKeys(
    roleNames,
    ministries.map((m) => m.key),
  );

  const [ministryKey, setMinistryKey] = useState<string>("");
  const [campusId, setCampusId] = useState<string>("");
  const [serviceDate, setServiceDate] = useState<string>(mostRecentSunday());
  const [category, setCategory] = useState<string>("servers");
  const [count, setCount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const selectedMinistry = ministryKey || leadableKeys[0] || "";
  const { data: records = [], isLoading: recordsLoading } = useServingRecords();

  const chartData = useMemo(() => {
    if (!selectedMinistry) return [];
    const cutoff = format(subWeeks(new Date(), 12), "yyyy-MM-dd");
    const totals = new Map<string, number>();

    for (const record of records) {
      if (record.ministry_key !== selectedMinistry) continue;
      if (record.category !== category) continue;
      if (record.service_date < cutoff) continue;
      totals.set(record.service_date, (totals.get(record.service_date) ?? 0) + record.count);
    }

    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date: format(new Date(`${date}T00:00:00`), "MMM d"), total }));
  }, [records, selectedMinistry, category]);

  const handleSave = async () => {
    if (!user || !selectedMinistry || !campusId || !serviceDate || !count) {
      toast.error("Ministry, campus, date, and count are required");
      return;
    }

    try {
      await upsertRecord.mutateAsync({
        ministry_key: selectedMinistry,
        campus_id: campusId,
        service_date: serviceDate,
        category,
        count: Number(count),
        notes: notes.trim() || null,
        recorded_by: user.id,
      });
      toast.success("Serving record saved");
      setCount("");
      setNotes("");
    } catch (error) {
      console.error("Failed to save serving record:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save serving record");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Record serving numbers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {leadableKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don't lead any ministries, so there's nothing to record here yet.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Ministry</Label>
                  <Select value={selectedMinistry} onValueChange={setMinistryKey}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose ministry" />
                    </SelectTrigger>
                    <SelectContent>
                      {ministries
                        .filter((ministry) => leadableKeys.includes(ministry.key))
                        .map((ministry) => (
                          <SelectItem key={ministry.key} value={ministry.key}>
                            {ministry.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Campus</Label>
                  <Select value={campusId} onValueChange={setCampusId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose campus" />
                    </SelectTrigger>
                    <SelectContent>
                      {campuses.map((campus) => (
                        <SelectItem key={campus.id} value={campus.id}>
                          {campus.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Service date</Label>
                    <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Count</Label>
                  <Input
                    type="number"
                    min="0"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything notable" />
                </div>
                <Button className="w-full" onClick={handleSave} disabled={upsertRecord.isPending}>
                  {upsertRecord.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">
              {ministries.find((m) => m.key === selectedMinistry)?.name ?? "Ministry"} — last 12 weeks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No {category} records in the last 12 weeks.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={12} tickLine={false} />
                  <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent records</CardTitle>
        </CardHeader>
        <CardContent>
          {recordsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : records.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No serving records yet. Save your first one above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Ministry</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.slice(0, 20).map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.service_date}</TableCell>
                    <TableCell>{record.ministries?.name ?? record.ministry_key}</TableCell>
                    <TableCell>{record.campuses?.name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{record.category}</TableCell>
                    <TableCell className="text-right font-medium">{record.count}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{record.notes ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
