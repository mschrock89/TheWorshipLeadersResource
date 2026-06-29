import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileText, X, Loader2, Check, AlertCircle } from "lucide-react";
import Papa from "papaparse";
import { BASE_ROLES, ROLE_LABELS } from "@/lib/constants";
import type { Database } from "@/integrations/supabase/types";

type TeamPosition = Database["public"]["Enums"]["team_position"];

interface TeamMember {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  positions: string[];
  birthday: string;
  anniversary: string;
}

interface ImportResult {
  email: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

interface ExistingDirectoryMember {
  email: string | null;
  full_name: string | null;
}

interface SkippedMember {
  email: string;
  name: string;
  reason: string;
}

interface TeamImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
  existingMembers?: ExistingDirectoryMember[];
}

// Map Planning Center position names to database enum values
const positionMapping: Record<string, TeamPosition> = {
  // Vocals
  'vocals': 'vocalist',
  'lead vocals': 'vocalist',
  'lead': 'vocalist',
  'harmony vocals': 'vocalist',
  'harmony': 'vocalist',
  'backup vocals': 'vocalist',
  'bv': 'vocalist',
  'bgv': 'vocalist',
  'background vocals': 'vocalist',
  
  // Guitars
  'ag': 'acoustic_guitar',
  'acoustic': 'acoustic_guitar',
  'acoustic guitar': 'acoustic_guitar',
  'eg': 'electric_guitar',
  'electric': 'electric_guitar',
  'electric guitar': 'electric_guitar',
  
  // Other instruments
  'keys': 'keys',
  'keyboard': 'keys',
  'keyboards': 'keys',
  'piano': 'piano',
  'drums': 'drums',
  'bass': 'bass',
  'bass guitar': 'bass',
  'violin': 'violin',
  'cello': 'cello',
  'saxophone': 'saxophone',
  'sax': 'saxophone',
  'trumpet': 'trumpet',
  
  // Tech
  'foh': 'sound_tech',
  'sound': 'sound_tech',
  'audio': 'sound_tech',
  'sound tech': 'sound_tech',
  'lights': 'lighting',
  'lighting': 'lighting',
  'lighting tech': 'lighting',
  'video': 'media',
  'video tech': 'media',
  'camera': 'media',
  'media': 'media',
  'lyric': 'media',
  'lyrics': 'media',
  'propresenter': 'media',
  'photo': 'photo_team',
  'photos': 'photo_team',
  'photographer': 'photo_team',
  'photo team': 'photo_team',
  'art': 'art_team',
  'artist': 'art_team',
  'art team': 'art_team',
  
  // Default
  'other': 'other'
};

function mapPosition(csvPosition: string): TeamPosition | null {
  const normalized = csvPosition.toLowerCase().trim();
  return positionMapping[normalized] || null;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  
  // Try to parse various date formats
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  
  // Return in YYYY-MM-DD format for database
  return date.toISOString().split('T')[0];
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function normalizeHeader(header: string): string {
  return header.replace(/^\ufeff/, '').trim().toLowerCase();
}

function findColumnKey(keys: string[], candidates: string[]): string | undefined {
  return keys.find((key) => candidates.includes(normalizeHeader(key)));
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const normalizedName = fullName.trim().replace(/\s+/g, ' ');
  if (!normalizedName) return { firstName: '', lastName: '' };

  const commaParts = normalizedName.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      firstName: commaParts.slice(1).join(' '),
      lastName: commaParts[0]
    };
  }

  const nameParts = normalizedName.split(' ');
  return {
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ')
  };
}

function cleanPhone(phone: string): string {
  return phone
    .replace(/\s*\((preferred|primary)\)\s*$/i, '')
    .trim();
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

function normalizeName(name: string | null | undefined): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getMemberName(member: TeamMember): string {
  return [member.firstName, member.lastName].filter(Boolean).join(' ');
}

export function TeamImportDialog({
  open,
  onOpenChange,
  onImportComplete,
  existingMembers = [],
}: TeamImportDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [skippedMembers, setSkippedMembers] = useState<SkippedMember[]>([]);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [baseRole, setBaseRole] = useState<string>("volunteer");

  const resetState = useCallback(() => {
    setFile(null);
    setMembers([]);
    setSkippedMembers([]);
    setResults(null);
    setParsing(false);
    setImporting(false);
    setBaseRole("volunteer");
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
  }, [resetState, onOpenChange]);

  const parseCSV = (file: File): Promise<TeamMember[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const members: TeamMember[] = [];
          const data = results.data as Record<string, string>[];
          
          if (data.length === 0) {
            resolve([]);
            return;
          }
          
          const keys = Object.keys(data[0]);
          
          // Find column keys for Planning Center export format
          const emailKey = findColumnKey(keys, ['home email', 'email']);
          const firstNameKey = findColumnKey(keys, ['first name', 'first']);
          const lastNameKey = findColumnKey(keys, ['last name', 'last']);
          const fullNameKey = findColumnKey(keys, ['name', 'full name']);
          const homePhoneKey = findColumnKey(keys, ['home phone', 'home']);
          const mobilePhoneKey = findColumnKey(keys, ['mobile phone', 'mobile', 'cell phone', 'cell', 'phone']);
          const workPhoneKey = findColumnKey(keys, ['work phone', 'work']);
          const positionKey = findColumnKey(keys, ['position', 'positions']);
          const birthdateKey = findColumnKey(keys, ['birthdate', 'birthday']);
          const anniversaryKey = findColumnKey(keys, ['anniversary']);

          // Address can arrive as a single column or split across street/city/state/zip.
          const addressKey = findColumnKey(keys, ['address', 'home address', 'street address', 'mailing address', 'street', 'address line 1', 'address 1']);
          const address2Key = findColumnKey(keys, ['address line 2', 'address 2', 'apt', 'unit']);
          const cityKey = findColumnKey(keys, ['city']);
          const stateKey = findColumnKey(keys, ['state', 'province', 'region']);
          const zipKey = findColumnKey(keys, ['zip', 'zip code', 'postal code', 'postcode']);
          
          for (const row of data) {
            const email = emailKey ? row[emailKey]?.trim() : '';
            if (!email || !email.includes('@')) continue;
            
            const parsedName = fullNameKey ? parseName(row[fullNameKey] || '') : { firstName: '', lastName: '' };
            const firstName = (firstNameKey ? row[firstNameKey]?.trim() || '' : '') || parsedName.firstName;
            const lastName = (lastNameKey ? row[lastNameKey]?.trim() || '' : '') || parsedName.lastName;
            
            // Prefer mobile phone, then home, then work. Planning Center exports may use either
            // "Mobile Phone" or just "Mobile" depending on the export view.
            const mobilePhone = mobilePhoneKey ? cleanPhone(row[mobilePhoneKey] || '') : '';
            const homePhone = homePhoneKey ? cleanPhone(row[homePhoneKey] || '') : '';
            const workPhone = workPhoneKey ? cleanPhone(row[workPhoneKey] || '') : '';
            const phone = mobilePhone || homePhone || workPhone;
            
            // Parse positions (can be comma-separated)
            const positionStr = positionKey ? row[positionKey]?.trim() || '' : '';
            const positions = positionStr
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0);
            
            // Parse dates
            const birthday = birthdateKey ? formatDate(row[birthdateKey]?.trim() || '') : '';
            const anniversary = anniversaryKey ? formatDate(row[anniversaryKey]?.trim() || '') : '';

            // Assemble address from whichever columns are present.
            const street = [
              addressKey ? row[addressKey]?.trim() || '' : '',
              address2Key ? row[address2Key]?.trim() || '' : '',
            ].filter(Boolean).join(' ');
            const cityStateZip = [
              cityKey ? row[cityKey]?.trim() || '' : '',
              [
                stateKey ? row[stateKey]?.trim() || '' : '',
                zipKey ? row[zipKey]?.trim() || '' : '',
              ].filter(Boolean).join(' '),
            ].filter(Boolean).join(', ');
            const address = [street, cityStateZip].filter(Boolean).join(', ');
            
            members.push({
              firstName,
              lastName,
              email: email.toLowerCase(),
              phone,
              address,
              positions,
              birthday,
              anniversary
            });
          }
          
          resolve(members);
        },
        error: (error) => reject(error)
      });
    });
  };

  const filterRepeatMembers = useCallback((parsedMembers: TeamMember[]) => {
    const existingEmails = new Set(existingMembers.map((member) => normalizeEmail(member.email)).filter(Boolean));
    const existingNames = new Set(existingMembers.map((member) => normalizeName(member.full_name)).filter(Boolean));
    const seenEmails = new Set<string>();
    const seenNames = new Set<string>();
    const nextMembers: TeamMember[] = [];
    const skipped: SkippedMember[] = [];

    parsedMembers.forEach((member) => {
      const email = normalizeEmail(member.email);
      const name = normalizeName(getMemberName(member));
      let reason = '';

      if (email && existingEmails.has(email)) {
        reason = 'Email already in directory';
      } else if (name && existingNames.has(name)) {
        reason = 'Name already in directory';
      } else if (email && seenEmails.has(email)) {
        reason = 'Duplicate email in CSV';
      } else if (name && seenNames.has(name)) {
        reason = 'Duplicate name in CSV';
      }

      if (reason) {
        skipped.push({
          email: email || member.email || 'unknown',
          name: getMemberName(member) || 'Unnamed',
          reason,
        });
        return;
      }

      if (email) seenEmails.add(email);
      if (name) seenNames.add(name);
      nextMembers.push(member);
    });

    return { nextMembers, skipped };
  }, [existingMembers]);

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a .csv file.",
        variant: "destructive"
      });
      return;
    }
    
    setFile(selectedFile);
    setParsing(true);
    setResults(null);
    
    try {
      const parsedMembers = await parseCSV(selectedFile);
      const { nextMembers, skipped } = filterRepeatMembers(parsedMembers);
      setSkippedMembers(skipped);
      
      if (parsedMembers.length === 0) {
        toast({
          title: "No valid members found",
          description: "Couldn't find any rows with valid email addresses.",
          variant: "destructive"
        });
        setFile(null);
      } else if (nextMembers.length === 0) {
        toast({
          title: "No new members to import",
          description: `Skipped ${skipped.length} repeat user${skipped.length !== 1 ? 's' : ''} already found by name or email.`,
        });
        setMembers([]);
      } else {
        setMembers(nextMembers);
        toast({
          title: "File parsed",
          description: `Found ${nextMembers.length} new team member${nextMembers.length !== 1 ? 's' : ''}${skipped.length > 0 ? `, skipped ${skipped.length} repeat user${skipped.length !== 1 ? 's' : ''}` : ''}`
        });
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: "Parse error",
        description: error instanceof Error ? error.message : "Failed to parse file",
        variant: "destructive"
      });
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const removeMember = (index: number) => {
    setMembers(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    const validMembers = members.filter(m => m.email && m.email.includes('@'));
    
    if (validMembers.length === 0) {
      toast({
        title: "No valid members",
        description: "Please add at least one member with a valid email.",
        variant: "destructive"
      });
      return;
    }

    setImporting(true);
    
    try {
      // Map positions to database enum values before sending
      const membersWithMappedPositions = validMembers.map(m => ({
        ...m,
        positions: m.positions
          .map(p => mapPosition(p))
          .filter((p): p is TeamPosition => p !== null)
      }));
      
      const { data, error } = await supabase.functions.invoke('import-team-members', {
        body: { members: membersWithMappedPositions, role: baseRole }
      });
      
      if (error) throw error;
      
      setResults(data.results);
      
      toast({
        title: "Import complete",
        description: `${data.successCount} imported${data.skippedCount ? `, ${data.skippedCount} skipped` : ''}${data.failCount ? `, ${data.failCount} failed` : ''}`
      });
      
      if (data.successCount > 0) {
        onImportComplete();
      }
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import members",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Members</DialogTitle>
          <DialogDescription>
            Upload a CSV with names, phone numbers, emails, and addresses. A profile
            is created for each row and assigned the base role you select below.
          </DialogDescription>
        </DialogHeader>

        {/* Base role for the whole upload group */}
        {!results && (
          <div className="space-y-2">
            <Label htmlFor="import-base-role">Base role for this upload group</Label>
            <Select value={baseRole} onValueChange={setBaseRole}>
              <SelectTrigger id="import-base-role">
                <SelectValue placeholder="Select a base role" />
              </SelectTrigger>
              <SelectContent>
                {BASE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role] || role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Every member in this CSV will be created with this role.
            </p>
          </div>
        )}

        {/* File Upload Area */}
        {!file && !parsing && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors"
          >
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-foreground font-medium mb-2">
              Drag and drop your CSV file here
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Include columns for name, email, phone, and address (Planning Center
              exports work too)
            </p>
            <Label htmlFor="file-upload">
              <Button variant="outline" asChild>
                <span>
                  <FileText className="h-4 w-4 mr-2" />
                  Choose File
                </span>
              </Button>
            </Label>
            <Input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        )}

        {/* Parsing State */}
        {parsing && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Parsing file...</p>
          </div>
        )}

        {file && !parsing && members.length === 0 && skippedMembers.length > 0 && !results && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="font-medium">No new members to import</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {skippedMembers.length} repeat user{skippedMembers.length !== 1 ? 's were' : ' was'} filtered out by matching name or email in the directory.
              </p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skippedMembers.map((member, index) => (
                    <TableRow key={`${member.email}-${index}`}>
                      <TableCell>{member.name}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{member.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetState}>
                Choose Another File
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}

        {/* Preview Table */}
        {members.length > 0 && !results && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm text-muted-foreground">
                  {members.length} new member{members.length !== 1 ? 's' : ''} ready to import
                </p>
                {skippedMembers.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {skippedMembers.length} repeat user{skippedMembers.length !== 1 ? 's' : ''} filtered out by name or email
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={resetState}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Position(s)</TableHead>
                    <TableHead>Birthday</TableHead>
                    <TableHead>Anniversary</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {member.firstName} {member.lastName}
                      </TableCell>
                      <TableCell className="text-sm">
                        {member.email}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {member.phone || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {member.address || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.positions.length > 0 ? (
                            member.positions.map((pos, i) => {
                              const mapped = mapPosition(pos);
                              return (
                                <Badge 
                                  key={i} 
                                  variant={mapped ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {pos}
                                  {!mapped && <span className="ml-1 text-muted-foreground">?</span>}
                                </Badge>
                              );
                            })
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDisplayDate(member.birthday) || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDisplayDate(member.anniversary) || '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMember(index)}
                          className="h-8 w-8"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              Positions marked with ? could not be mapped and will be skipped
            </p>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import {members.length} Member{members.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </>
        )}

        {/* Results */}
        {results && (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell>{result.email}</TableCell>
                      <TableCell>
                        {result.skipped ? (
                          <span className="flex items-center text-muted-foreground">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {result.error || 'Skipped'}
                          </span>
                        ) : result.success ? (
                          <span className="flex items-center text-green-600">
                            <Check className="h-4 w-4 mr-1" />
                            Imported
                          </span>
                        ) : (
                          <span className="flex items-center text-destructive">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {result.error || 'Failed'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end mt-4">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
