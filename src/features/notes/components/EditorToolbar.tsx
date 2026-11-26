import { useRef, type ChangeEvent } from 'react';
import {
  Bold,
  CheckSquare,
  Code,
  FileCode2,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  Quote,
  Shapes,
  Sigma,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import type { FormatAction } from './MarkdownEditor';

export interface EditorToolbarProps {
  onFormat: (action: FormatAction) => void;
  onAttachFiles: (files: FileList) => void;
}

interface ToolbarAction {
  readonly action: FormatAction;
  readonly label: string;
  readonly icon: LucideIcon;
}

const TEXT_ACTIONS: readonly ToolbarAction[] = [
  { action: 'heading', label: 'Heading', icon: Heading2 },
  { action: 'bold', label: 'Bold (Ctrl+B)', icon: Bold },
  { action: 'italic', label: 'Italic (Ctrl+I)', icon: Italic },
];

const LIST_ACTIONS: readonly ToolbarAction[] = [
  { action: 'ul', label: 'Bullet list', icon: List },
  { action: 'ol', label: 'Numbered list', icon: ListOrdered },
  { action: 'checklist', label: 'Checklist', icon: CheckSquare },
  { action: 'quote', label: 'Blockquote', icon: Quote },
];

const BLOCK_ACTIONS: readonly ToolbarAction[] = [
  { action: 'code', label: 'Inline code', icon: Code },
  { action: 'codeblock', label: 'Code block', icon: FileCode2 },
  { action: 'link', label: 'Link', icon: Link2 },
  { action: 'table', label: 'Table', icon: Table2 },
  { action: 'math', label: 'Math equation', icon: Sigma },
  { action: 'diagram', label: 'Insert Diagram / Sketch', icon: Shapes },
];

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/**
 * Minimal, single-row Markdown formatting toolbar for common editing actions
 * and local attachment uploads.
 */
export function EditorToolbar({
  onFormat,
  onAttachFiles,
}: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onAttachFiles(event.target.files);
      event.target.value = '';
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Markdown formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-border bg-background px-4 py-1.5"
    >
      {TEXT_ACTIONS.map((item) => (
        <ToolbarButton
          key={item.action}
          label={item.label}
          icon={item.icon}
          onClick={() => onFormat(item.action)}
        />
      ))}

      <Separator orientation="vertical" className="mx-1.5 h-4" />

      {LIST_ACTIONS.map((item) => (
        <ToolbarButton
          key={item.action}
          label={item.label}
          icon={item.icon}
          onClick={() => onFormat(item.action)}
        />
      ))}

      <Separator orientation="vertical" className="mx-1.5 h-4" />

      {BLOCK_ACTIONS.map((item) => (
        <ToolbarButton
          key={item.action}
          label={item.label}
          icon={item.icon}
          onClick={() => onFormat(item.action)}
        />
      ))}

      <Separator orientation="vertical" className="mx-1.5 h-4" />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      <ToolbarButton
        label="Attach image or file"
        icon={Paperclip}
        onClick={() => fileInputRef.current?.click()}
      />
    </div>
  );
}
