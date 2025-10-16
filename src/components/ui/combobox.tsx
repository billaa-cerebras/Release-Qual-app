"use client"

import * as React from "react"
import { Check, ChevronsUpDown, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type ComboboxOption = {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  notFoundText?: string;
  allowCustom?: boolean;
  onCustomAdd?: (newValue: string) => void;
}

export function Combobox({ 
  options, 
  value, 
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  notFoundText = "Nothing found.",
  allowCustom = false,
  onCustomAdd,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value || "");

  React.useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  const currentOption = options.find((option) => option.value.toLowerCase() === value?.toLowerCase());
  const isInvalid = value && !currentOption;

  const handleCustomAdd = () => {
    if (inputValue && onCustomAdd) {
      onCustomAdd(inputValue);
      onChange(inputValue);
      setOpen(false);
    }
  };

  const showCreateOption = allowCustom && onCustomAdd && inputValue;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            !value && "text-muted-foreground",
            isInvalid && "border-red-500 text-red-500 hover:text-red-600"
          )}
        >
          {currentOption ? currentOption.label : value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput 
            placeholder={searchPlaceholder} 
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>{notFoundText}</CommandEmpty>
            
            {/* Pinned "Create" Option Group */}
            {showCreateOption && (
              <>
                <CommandGroup heading="New Model">
                  <CommandItem
                    onSelect={handleCustomAdd}
                    className="cursor-pointer"
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create "{inputValue}"
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            
            {/* Searchable Options Group */}
            <CommandGroup heading="Existing Models">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    const newValue = currentValue === value ? "" : currentValue;
                    onChange(newValue);
                    setInputValue(newValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}