'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  Bold,
  ChevronDown,
  ChevronUp,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Type,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import { cn } from '@/lib/utils';
import {
  clinicalMarkdownToHtml,
  hasClinicalMarkdown,
  hydrateMarkdownInHtml,
} from './clinical-markdown';

/** Persist `data-field` on headings and paragraphs so PDF/fax round-trip pharmacist edits. */
const DataField = Extension.create({
  name: 'dataField',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          fieldKey: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('data-field'),
            renderHTML: (attributes: { fieldKey?: string | null }) => {
              if (!attributes.fieldKey) return {};
              return { 'data-field': attributes.fieldKey };
            },
          },
          pcpCard: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('data-pcp-card'),
            renderHTML: (attributes: { pcpCard?: string | null }) => {
              if (!attributes.pcpCard) return {};
              return { 'data-pcp-card': attributes.pcpCard };
            },
          },
        },
      },
    ];
  },
});

interface Props {
  /** Stable key — remount editor when document type / open cycle changes */
  editorKey: string;
  initialHtml: string;
  onChange: (html: string) => void;
  editable?: boolean;
  /** Override TipTap content min-height classes */
  contentClassName?: string;
  /** Slightly denser chrome for dialogs */
  compact?: boolean;
  dir?: 'ltr' | 'rtl';
  lang?: string;
  /** Extra actions on the right of the formatting toolbar (e.g. Fax). */
  toolbarEnd?: ReactNode;
  /** Extra classes on the TipTap canvas (e.g. DAP professional spacing). */
  editorClassName?: string;
  /**
   * Collapse formatting tools until the pharmacist expands them.
   * Prescribe workspace opts in; other editors keep the toolbar visible.
   */
  collapsibleToolbar?: boolean;
  /** Controlled expanded state. When omitted, the editor starts collapsed. */
  toolbarOpen?: boolean;
  onToolbarOpenChange?: (open: boolean) => void;
  /** Hide the editor-owned toggle when a parent (e.g. PCP header) owns it. */
  showToolbarToggle?: boolean;
}

/**
 * Single Notion-like TipTap canvas — title, headings, and body are one live document.
 */
export function NotionDocumentEditor({
  editorKey,
  initialHtml,
  onChange,
  editable = true,
  contentClassName,
  compact = false,
  dir = 'ltr',
  lang,
  toolbarEnd,
  editorClassName,
  collapsibleToolbar = false,
  toolbarOpen,
  onToolbarOpenChange,
  showToolbarToggle = true,
}: Props) {
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const expanded = collapsibleToolbar ? (toolbarOpen ?? uncontrolledOpen) : true;

  const setExpanded = (next: boolean) => {
    if (toolbarOpen === undefined) setUncontrolledOpen(next);
    onToolbarOpenChange?.(next);
  };
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        code: false,
      }),
      DataField,
      Underline,
      Typography,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading' && node.attrs.level === 1) {
            return 'Untitled document';
          }
          if (node.type.name === 'heading') return 'Heading';
          return 'Type ‘/’ ideas… or just start writing';
        },
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty',
      }),
    ],
    [],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: hydrateMarkdownInHtml(initialHtml),
      editable,
      editorProps: {
        attributes: {
          class: cn(
            'notion-doc-prose outline-none',
            editorClassName,
            contentClassName ?? 'min-h-[min(62vh,640px)] px-1 py-1',
            'text-[15px] leading-[1.75] text-[#1f2933]',
            dir === 'rtl' && 'text-right',
          ),
          'aria-label': 'Document editor',
          dir,
          ...(lang ? { lang } : {}),
        },
        transformPastedHTML: (html) => hydrateMarkdownInHtml(html),
        handlePaste: (_view, event) => {
          const htmlClip = event.clipboardData?.getData('text/html') ?? '';
          if (htmlClip && /<(strong|b|em|ol|ul)\b/i.test(htmlClip)) return false;
          const text = event.clipboardData?.getData('text/plain') ?? '';
          if (!hasClinicalMarkdown(text)) return false;
          event.preventDefault();
          editorRef.current
            ?.chain()
            .focus()
            .insertContent(clinicalMarkdownToHtml(text))
            .run();
          return true;
        },
      },
      onCreate: ({ editor: ed }) => {
        editorRef.current = ed;
      },
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getHTML());
      },
    },
    [editorKey],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!collapsibleToolbar || toolbarOpen !== undefined) return;
    setUncontrolledOpen(false);
  }, [collapsibleToolbar, editorKey, toolbarOpen]);

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) {
        return {
          bold: false,
          italic: false,
          underline: false,
          h1: false,
          h2: false,
          bullet: false,
          ordered: false,
          center: false,
        };
      }
      return {
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        underline: ed.isActive('underline'),
        h1: ed.isActive('heading', { level: 1 }),
        h2: ed.isActive('heading', { level: 2 }),
        bullet: ed.isActive('bulletList'),
        ordered: ed.isActive('orderedList'),
        center: ed.isActive({ textAlign: 'center' }),
      };
    },
  });

  if (!editor) {
    return (
      <div
        className={cn(
          'animate-pulse rounded-lg bg-muted/30',
          contentClassName ?? 'min-h-[min(62vh,640px)]',
        )}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {collapsibleToolbar && showToolbarToggle ? (
        <div className={cn('sticky top-0 z-10', expanded ? 'mb-1' : compact ? 'mb-3' : 'mb-5')}>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="ss-document-format-toolbar"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4ecef] bg-white px-2.5 text-[12.5px] font-semibold text-[#3d6b9a]',
              'shadow-sm transition-colors hover:bg-[#eef4f8]',
              expanded && 'bg-[#eef4f8]',
            )}
          >
            <Type className="h-3.5 w-3.5" />
            Formatting
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ) : null}

      <div
        id="ss-document-format-toolbar"
        className={cn(
          'grid transition-[grid-template-rows,margin] duration-200 ease-out',
          expanded ? (compact ? 'mb-3 grid-rows-[1fr]' : 'mb-5 grid-rows-[1fr]') : 'mb-0 grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              'sticky top-0 z-10 flex w-full flex-wrap items-center gap-0.5 rounded-xl border border-[#e4ecef] bg-white/95 shadow-sm backdrop-blur',
              'supports-[backdrop-filter]:bg-white/80',
              compact ? 'p-1' : 'p-1.5',
            )}
            role="toolbar"
            aria-label="Document formatting"
            aria-hidden={!expanded}
            {...(!expanded ? { inert: true } : {})}
          >
            <ToolBtn
              label="Bold"
              active={toolbar?.bold}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              label="Italic"
              active={toolbar?.italic}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              label="Underline"
              active={toolbar?.underline}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="h-3.5 w-3.5" />
            </ToolBtn>
            <Sep />
            <ToolBtn
              label="Title"
              active={toolbar?.h1}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              <Heading1 className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              label="Heading"
              active={toolbar?.h2}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 className="h-3.5 w-3.5" />
            </ToolBtn>
            <Sep />
            <ToolBtn
              label="Bullet list"
              active={toolbar?.bullet}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              label="Numbered list"
              active={toolbar?.ordered}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </ToolBtn>
            <Sep />
            <ToolBtn
              label="Align left"
              active={!toolbar?.center}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              label="Align center"
              active={toolbar?.center}
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </ToolBtn>
            <Sep />
            <ToolBtn
              label="Divider"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus className="h-3.5 w-3.5" />
            </ToolBtn>
            {collapsibleToolbar ? (
              <ToolBtn label="Hide formatting tools" onClick={() => setExpanded(false)}>
                <ChevronUp className="h-3.5 w-3.5" />
              </ToolBtn>
            ) : null}
            {toolbarEnd ? (
              <div className="ml-auto flex items-center gap-1.5 pl-2">{toolbarEnd}</div>
            ) : null}
          </div>
        </div>
      </div>

      <BubbleMenu
        editor={editor}
        options={{ placement: 'top', offset: 8 }}
        className="flex items-center gap-0.5 rounded-lg border border-border/80 bg-card p-1 shadow-md"
      >
        <ToolBtn
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          label="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          label="Heading"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolBtn>
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-[#e4ecef]" aria-hidden />;
}

function ToolBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#3f4b57] transition-colors',
        'hover:bg-[#eef5f6] hover:text-[#111827]',
        active && 'bg-[#e6f4f3] text-[#0f766e]',
      )}
    >
      {children}
    </button>
  );
}
