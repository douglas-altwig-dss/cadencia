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
  if (!hasSelection) {
    return (
      <>
        <Menu.Item leftSection={<IconClipboard size={14} />} rightSection={<Key>Ctrl+V</Key>} disabled={!canPaste} onClick={onPaste}>
          Colar
        </Menu.Item>
        <Menu.Item rightSection={<Key>Ctrl+A</Key>} onClick={onSelectAll}>
          Selecionar tudo
        </Menu.Item>
        {hiddenCount > 0 && onShowHidden && (
          <Menu.Item leftSection={<IconEye size={14} />} onClick={onShowHidden}>
            Mostrar formas ocultas ({hiddenCount})
          </Menu.Item>
        )}
        {onComment && (
          <Menu.Item leftSection={<IconMessage size={14} />} onClick={onComment}>
            Comentar este slide
          </Menu.Item>
        )}
      </>
    );
  }
  return (
    <>
      <Menu.Item leftSection={<IconCopy size={14} />} rightSection={<Key>Ctrl+C</Key>} onClick={onCopy}>
        Copiar
      </Menu.Item>
      <Menu.Item leftSection={<IconClipboard size={14} />} rightSection={<Key>Ctrl+V</Key>} disabled={!canPaste} onClick={onPaste}>
        Colar
      </Menu.Item>
      <Menu.Item leftSection={<IconCopy size={14} />} rightSection={<Key>Ctrl+D</Key>} onClick={onDuplicate}>
        Duplicar
      </Menu.Item>
      <Menu.Divider />
      <Menu.Sub>
        <Menu.Sub.Target>
          <Menu.Sub.Item leftSection={<IconStack2 size={14} />}>Ordem</Menu.Sub.Item>
        </Menu.Sub.Target>
        <Menu.Sub.Dropdown>
          <Menu.Item onClick={() => onOrder('front')}>Trazer para a frente</Menu.Item>
          <Menu.Item onClick={() => onOrder('forward')}>Avançar uma</Menu.Item>
          <Menu.Item onClick={() => onOrder('backward')}>Recuar uma</Menu.Item>
          <Menu.Item onClick={() => onOrder('back')}>Enviar para trás</Menu.Item>
        </Menu.Sub.Dropdown>
      </Menu.Sub>
      {canGroup && (
        <Menu.Item leftSection={<IconLayersUnion size={14} />} rightSection={<Key>Ctrl+G</Key>} onClick={onGroup}>
          Agrupar
        </Menu.Item>
      )}
      {canUngroup && (
        <Menu.Item
          leftSection={<IconLayersSubtract size={14} />}
          rightSection={<Key>Ctrl+Shift+G</Key>}
          onClick={onUngroup}
        >
          Desagrupar
        </Menu.Item>
      )}
      {onCopyStyle && (
        <Menu.Item leftSection={<IconBrush size={14} />} rightSection={<Key>Ctrl+Shift+C</Key>} onClick={onCopyStyle}>
          Copiar formato
        </Menu.Item>
      )}
      {onPasteStyle && (
        <Menu.Item leftSection={<IconBrush size={14} />} rightSection={<Key>Ctrl+Shift+V</Key>} disabled={!canPasteStyle} onClick={onPasteStyle}>
          Colar formato
        </Menu.Item>
      )}
      {onLock && (
        <Menu.Item leftSection={locked ? <IconLockOpen size={14} /> : <IconLock size={14} />} rightSection={<Key>Ctrl+L</Key>} onClick={onLock}>
          {locked ? 'Desbloquear' : 'Bloquear posição e tamanho'}
        </Menu.Item>
      )}
      {onHide && (
        <Menu.Item leftSection={<IconEyeOff size={14} />} onClick={onHide}>
          Ocultar no editor
        </Menu.Item>
      )}
      {onComment && (
        <Menu.Item leftSection={<IconMessage size={14} />} onClick={onComment}>
          Comentar
        </Menu.Item>
      )}
      {canReset && (
        <Menu.Item leftSection={<IconArrowBackUp size={14} />} onClick={onReset}>
          Reverter para os dados
        </Menu.Item>
      )}
      <Menu.Divider />
      <Menu.Item color="red" leftSection={<IconTrash size={14} />} rightSection={<Key>Del</Key>} onClick={onDelete} disabled={locked}>
        Remover
      </Menu.Item>
    </>
  );
}
