import { Menu, Text } from '@mantine/core';
import {
  IconArrowBackUp,
  IconBrush,
  IconEye,
  IconEyeOff,
  IconLock,
  IconLockOpen,
  IconMessage,
  IconClipboard,
  IconCopy,
  IconLayersSubtract,
  IconLayersUnion,
  IconStack2,
  IconTrash,
} from '@tabler/icons-react';

import { useT } from '../../i18n';

const Key = ({ children }: { children: string }) => (
  <Text size="xs" c="dimmed" className="mono">
    {children}
  </Text>
);

/**
 * The right-click menu for the canvas (RF-53), as the dropdown of a `Menu.ContextMenu`.
 *
 * Mantine positions it at the pointer; `SlideStage` only says what was clicked, so the shape under
 * the cursor is selected before the menu opens — right-clicking something you had not selected acts
 * on that thing, the way it does in both products.
 */
export function CanvasMenuItems({
  hasSelection,
  canPaste,
  canGroup,
  canUngroup,
  canReset,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onOrder,
  onGroup,
  onUngroup,
  onReset,
  onSelectAll,
  locked = false,
  onLock,
  onHide,
  hiddenCount = 0,
  onShowHidden,
  onCopyStyle,
  onPasteStyle,
  canPasteStyle = false,
  onComment,
}: {
  hasSelection: boolean;
  canPaste: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canReset: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOrder: (direction: 'front' | 'back' | 'forward' | 'backward') => void;
  onGroup: () => void;
  onUngroup: () => void;
  onReset: () => void;
  onSelectAll: () => void;
  /** RF-89: the selection is locked (so it cannot be removed) and the commands that change that. */
  locked?: boolean;
  onLock?: () => void;
  onHide?: () => void;
  hiddenCount?: number;
  onShowHidden?: () => void;
  /** RF-90 */
  onCopyStyle?: () => void;
  onPasteStyle?: () => void;
  canPasteStyle?: boolean;
  /** RF-93 */
  onComment?: () => void;
}) {
  const t = useT();
  if (!hasSelection) {
    return (
      <>
        <Menu.Item leftSection={<IconClipboard size={14} />} rightSection={<Key>Ctrl+V</Key>} disabled={!canPaste} onClick={onPaste}>
          {t.editor.canvasMenu.paste}
        </Menu.Item>
        <Menu.Item rightSection={<Key>Ctrl+A</Key>} onClick={onSelectAll}>
          {t.editor.canvasMenu.selectAll}
        </Menu.Item>
        {hiddenCount > 0 && onShowHidden && (
          <Menu.Item leftSection={<IconEye size={14} />} onClick={onShowHidden}>
            {t.editor.canvasMenu.showHidden(hiddenCount)}
          </Menu.Item>
        )}
        {onComment && (
          <Menu.Item leftSection={<IconMessage size={14} />} onClick={onComment}>
            {t.editor.canvasMenu.commentSlide}
          </Menu.Item>
        )}
      </>
    );
  }
  return (
    <>
      <Menu.Item leftSection={<IconCopy size={14} />} rightSection={<Key>Ctrl+C</Key>} onClick={onCopy}>
        {t.editor.canvasMenu.copy}
      </Menu.Item>
      <Menu.Item leftSection={<IconClipboard size={14} />} rightSection={<Key>Ctrl+V</Key>} disabled={!canPaste} onClick={onPaste}>
        {t.editor.canvasMenu.paste}
      </Menu.Item>
      <Menu.Item leftSection={<IconCopy size={14} />} rightSection={<Key>Ctrl+D</Key>} onClick={onDuplicate}>
        {t.editor.canvasMenu.duplicate}
      </Menu.Item>
      <Menu.Divider />
      <Menu.Sub>
        <Menu.Sub.Target>
          <Menu.Sub.Item leftSection={<IconStack2 size={14} />}>{t.editor.canvasMenu.order}</Menu.Sub.Item>
        </Menu.Sub.Target>
        <Menu.Sub.Dropdown>
          <Menu.Item onClick={() => onOrder('front')}>{t.editor.canvasMenu.bringToFront}</Menu.Item>
          <Menu.Item onClick={() => onOrder('forward')}>{t.editor.canvasMenu.bringForward}</Menu.Item>
          <Menu.Item onClick={() => onOrder('backward')}>{t.editor.canvasMenu.sendBackward}</Menu.Item>
          <Menu.Item onClick={() => onOrder('back')}>{t.editor.canvasMenu.sendToBack}</Menu.Item>
        </Menu.Sub.Dropdown>
      </Menu.Sub>
      {canGroup && (
        <Menu.Item leftSection={<IconLayersUnion size={14} />} rightSection={<Key>Ctrl+G</Key>} onClick={onGroup}>
          {t.editor.canvasMenu.group}
        </Menu.Item>
      )}
      {canUngroup && (
        <Menu.Item
          leftSection={<IconLayersSubtract size={14} />}
          rightSection={<Key>Ctrl+Shift+G</Key>}
          onClick={onUngroup}
        >
          {t.editor.canvasMenu.ungroup}
        </Menu.Item>
      )}
      {onCopyStyle && (
        <Menu.Item leftSection={<IconBrush size={14} />} rightSection={<Key>Ctrl+Shift+C</Key>} onClick={onCopyStyle}>
          {t.editor.canvasMenu.copyStyle}
        </Menu.Item>
      )}
      {onPasteStyle && (
        <Menu.Item leftSection={<IconBrush size={14} />} rightSection={<Key>Ctrl+Shift+V</Key>} disabled={!canPasteStyle} onClick={onPasteStyle}>
          {t.editor.canvasMenu.pasteStyle}
        </Menu.Item>
      )}
      {onLock && (
        <Menu.Item leftSection={locked ? <IconLockOpen size={14} /> : <IconLock size={14} />} rightSection={<Key>Ctrl+L</Key>} onClick={onLock}>
          {locked ? t.editor.canvasMenu.unlock : t.editor.canvasMenu.lock}
        </Menu.Item>
      )}
      {onHide && (
        <Menu.Item leftSection={<IconEyeOff size={14} />} onClick={onHide}>
          {t.editor.canvasMenu.hide}
        </Menu.Item>
      )}
      {onComment && (
        <Menu.Item leftSection={<IconMessage size={14} />} onClick={onComment}>
          {t.editor.canvasMenu.comment}
        </Menu.Item>
      )}
      {canReset && (
        <Menu.Item leftSection={<IconArrowBackUp size={14} />} onClick={onReset}>
          {t.editor.canvasMenu.reset}
        </Menu.Item>
      )}
      <Menu.Divider />
      <Menu.Item color="red" leftSection={<IconTrash size={14} />} rightSection={<Key>Del</Key>} onClick={onDelete} disabled={locked}>
        {t.editor.canvasMenu.remove}
      </Menu.Item>
    </>
  );
}
