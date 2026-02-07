import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSongKeys, useAddSongKey } from "@/hooks/useSongKeys";
import { Badge } from "@/components/ui/badge";

interface KeySelectorProps {
  value: string | null;
  onChange: (key: string | null) => void;
  suggestedKey?: string | null;
  compact?: boolean;
  disabled?: boolean;
}

export function KeySelector({
  value,
  onChange,
  suggestedKey,
  compact = false,
  disabled = false,
}: KeySelectorProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const { data: keys = [], isLoading } = useSongKeys();
  const addKey = useAddSongKey();

  const handleAddNewKey = async () => {
    if (!inputValue.trim()) return;
    
    try {
      const newKey = await addKey.mutateAsync(inputValue.trim());
      onChange(newKey.key_name);
      setInputValue("");
      setOpen(false);
    } catch (error) {
      console.error("Failed to add key:", error);
    }
  };

  const filteredKeys = keys.filter((key) =>
    key.key_name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const showAddOption =
    inputValue.trim() &&
    !keys.some(
      (key) => key.key_name.toLowerCase() === inputValue.trim().toLowerCase()
    );

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-7 w-14 justify-between px-2 text-xs font-medium",
              !value && "text-muted-foreground"
            )}
          >
            {value || "Key"}
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or add key..."
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              <CommandEmpty>
                {showAddOption ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleAddNewKey}
                    disabled={addKey.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add "{inputValue}"
                  </Button>
                ) : (
                  "No key found."
                )}
              </CommandEmpty>
              
              {suggestedKey && (
                <>
                  <CommandGroup heading="Suggested">
                    <CommandItem
                      value={suggestedKey}
                      onSelect={() => {
                        onChange(suggestedKey);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === suggestedKey ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <Music className="mr-2 h-3 w-3 text-muted-foreground" />
                      {suggestedKey}
                      <Badge variant="secondary" className="ml-auto text-xs">
                        Last used
                      </Badge>
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              
              <CommandGroup heading="Major Keys">
                {filteredKeys
                  .filter((k) => !k.key_name.includes("m") || k.key_name === "Am")
                  .filter((k) => !k.key_name.endsWith("m"))
                  .map((key) => (
                    <CommandItem
                      key={key.id}
                      value={key.key_name}
                      onSelect={() => {
                        onChange(key.key_name);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === key.key_name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {key.key_name}
                    </CommandItem>
                  ))}
              </CommandGroup>
              
              <CommandGroup heading="Minor Keys">
                {filteredKeys
                  .filter((k) => k.key_name.endsWith("m"))
                  .map((key) => (
                    <CommandItem
                      key={key.id}
                      value={key.key_name}
                      onSelect={() => {
                        onChange(key.key_name);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === key.key_name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {key.key_name}
                    </CommandItem>
                  ))}
              </CommandGroup>

              {showAddOption && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem onSelect={handleAddNewKey}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add "{inputValue}"
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className="w-[120px] justify-between"
        >
          {value || "Select key..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput
            placeholder="Search or add key..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>
              {showAddOption ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleAddNewKey}
                  disabled={addKey.isPending}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add "{inputValue}"
                </Button>
              ) : (
                "No key found."
              )}
            </CommandEmpty>
            
            <CommandGroup heading="Keys">
              {filteredKeys.map((key) => (
                <CommandItem
                  key={key.id}
                  value={key.key_name}
                  onSelect={() => {
                    onChange(key.key_name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === key.key_name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {key.key_name}
                </CommandItem>
              ))}
            </CommandGroup>

            {showAddOption && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={handleAddNewKey}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add "{inputValue}"
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
