'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { cn } from '@/lib/utils';
import { toEditorHtml } from '../documents/tiptap-text';

interface Props {
  editorKey: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

export function ReferralReasonEditor({ editorKey, value, onChange, disabled }: Props) {
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const acceptUpdatesRef = useRef(false);
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        blockquote: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['paragraph'],
        alignments: ['left', 'center', 'right'],
      }),
    ],
    [],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: toEditorHtml(value),
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            'min-h-[112px] px-3 py-2.5 text-[14.5px] leading-relaxed text-[#1f2933] outline-none',
          'aria-label': 'Reason for referral',
        },
      },
      onCreate: ({ editor: ed }) => {
        editorRef.current = ed;
        acceptUpdatesRef.current = false;
        requestAnimationFrame(() => {
          acceptUpdatesRef.current = true;
        });
      },
      onUpdate: ({ editor: ed }) => {
        if (!acceptUpdatesRef.current) return;
        onChange(ed.getHTML());
      },
    },
    [editorKey],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            underline: ed.isActive('underline'),
            bullet: ed.isActive('bulletList'),
            center: ed.isActive({ textAlign: 'center' }),
            right: ed.isActive({ textAlign: 'right' }),
          }
        : { bold: false, italic: false, underline: false, bullet: false, center: false, right: false },
  });

  if (!editor) {
    return <div className="min-h-[148px] animate-pulse rounded-lg bg-muted/30" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#D5DEE1] bg-white">
      {!disabled ? (
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-[#E6EEEF] bg-[#F8FBFC] px-1 py-1"
        role="toolbar"
        aria-label="Reason formatting"
      >
        <ToolBtn label="Bold" active={toolbar?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn label="Italic" active={toolbar?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          label="Underline"
          active={toolbar?.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          label="Bullet list"
          active={toolbar?.bullet}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          label="Align left"
          active={!toolbar?.center && !toolbar?.right}
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
        <ToolBtn
          label="Align right"
          active={toolbar?.right}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-[#3f4d56]',
        active ? 'bg-primary/12 text-primary' : 'hover:bg-black/5',
      )}
    >
      {children}
    </button>
  );
}
