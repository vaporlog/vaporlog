import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ALL_DEVICES,
  ALL_MOODS,
  ZONE_FILTER_OPTIONS,
  type DeviceOption,
  type ZoneFilter,
} from "./feed-utils";

interface FeedFiltersProps {
  /** Devices present in the feed data (already resolved for display). */
  devices: DeviceOption[];
  /** Mood tags present in the feed data. */
  moods: string[];
  device: string;
  zone: ZoneFilter;
  mood: string;
  onDeviceChange: (device: string) => void;
  onZoneChange: (zone: ZoneFilter) => void;
  onMoodChange: (mood: string) => void;
}

/**
 * The feed filter row — device, temperature zone, and mood, mirroring the
 * strain catalog's filter pattern (selects + a toggle group). Options are
 * derived from the sessions actually on display, so a filter can never
 * point at something the feed has never seen. All three combine (AND).
 */
export default function FeedFilters({
  devices,
  moods,
  device,
  zone,
  mood,
  onDeviceChange,
  onZoneChange,
  onMoodChange,
}: FeedFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        value={zone}
        onValueChange={(value) => {
          const next = ZONE_FILTER_OPTIONS.find(
            (option) => option.value === value,
          );
          if (next) onZoneChange(next.value);
        }}
        variant="outline"
        size="sm"
        aria-label="Filter by temperature zone"
        className="flex-wrap justify-start"
      >
        {ZONE_FILTER_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="pressable px-3"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Select value={device} onValueChange={onDeviceChange}>
        <SelectTrigger size="sm" aria-label="Filter by device">
          <SelectValue placeholder="Device" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_DEVICES}>All devices</SelectItem>
          {devices.map((option) => (
            <SelectItem key={option.slug} value={option.slug}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={mood} onValueChange={onMoodChange}>
        <SelectTrigger size="sm" aria-label="Filter by mood">
          <SelectValue placeholder="Mood" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MOODS}>All moods</SelectItem>
          {moods.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
