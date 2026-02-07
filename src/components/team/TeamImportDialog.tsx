import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileText, X, Loader2, Check, AlertCircle } from "lucide-react";
import Papa from "papaparse";
import type { Database } from "@/integrations/supabase/types";

type TeamPosition = Database["public"]["Enums"]["team_position"];

interface TeamMember {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  positions: string[];
  birthday: string;
  anniversary: string;
}

interface ImportResult {
  email: string;
  success: boolean;
  error?: string;
}

interface TeamImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
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

export function TeamImportDialog({ open, onOpenChange, onImportComplete }: TeamImportDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setMembers([]);
    setResults(null);
    setParsing(false);
    setImporting(false);
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
          const emailKey = keys.find(k => k.toLowerCase().includes('home email') || k.toLowerCase() === 'email');
          const firstNameKey = keys.find(k => k.toLowerCase() === 'first name');
          const lastNameKey = keys.find(k => k.toLowerCase() === 'last name');
          const homePhoneKey = keys.find(k => k.toLowerCase().includes('home phone'));
          const mobilePhoneKey = keys.find(k => k.toLowerCase().includes('mobile phone'));
          const positionKey = keys.find(k => k.toLowerCase() === 'position');
          const birthdateKey = keys.find(k => k.toLowerCase() === 'birthdate');
          const anniversaryKey = keys.find(k => k.toLowerCase() === 'anniversary');
          
          for (const row of data) {
            const email = emailKey ? row[emailKey]?.trim() : '';
            if (!email || !email.includes('@')) continue;
            
            const firstName = firstNameKey ? row[firstNameKey]?.trim() || '' : '';
            const lastName = lastNameKey ? row[lastNameKey]?.trim() || '' : '';
            
            // Prefer mobile phone, fall back to home phone
            const mobilePhone = mobilePhoneKey ? row[mobilePhoneKey]?.trim() || '' : '';
            const homePhone = homePhoneKey ? row[homePhoneKey]?.trim() || '' : '';
            const phone = mobilePhone || homePhone;
            
            // Parse positions (can be comma-separated)
            const positionStr = positionKey ? row[positionKey]?.trim() || '' : '';
            const positions = positionStr
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0);
            
            // Parse dates
            const birthday = birthdateKey ? formatDate(row[birthdateKey]?.trim() || '') : '';
            const anniversary = anniversaryKey ? formatDate(row[anniversaryKey]?.trim() || '') : '';
            
            members.push({
              firstName,
              lastName,
              email: email.toLowerCase(),
              phone,
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

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a CSV file from Planning Center.",
        variant: "destructive"
      });
      return;
    }
    
    setFile(selectedFile);
    setParsing(true);
    setResults(null);
    
    try {
      const parsedMembers = await parseCSV(selectedFile);
      
      if (parsedMembers.length === 0) {
        toast({
          title: "No valid members found",
          description: "Couldn't find any rows with valid email addresses.",
          variant: "destructive"
        });
        setFile(null);
      } else {
        setMembers(parsedMembers);
        toast({
          title: "File parsed",
          description: `Found ${parsedMembers.length} team member${parsedMembers.length !== 1 ? 's' : ''}`
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, []);

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
        body: { members: membersWithMappedPositions }
      });
      
      if (error) throw error;
      
      setResults(data.results);
      
      toast({
        title: "Import complete",
        description: `${data.successCount} imported, ${data.failCount} failed`
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
          <DialogTitle>Import Team Members</DialogTitle>
          <DialogDescription>
            Upload a CSV export from Planning Center
          </DialogDescription>
        </DialogHeader>

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
              Export from Planning Center Services → People
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

        {/* Preview Table */}
        {members.length > 0 && !results && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">
                {members.length} member{members.length !== 1 ? 's' : ''} found
              </p>
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
                        {result.success ? (
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
