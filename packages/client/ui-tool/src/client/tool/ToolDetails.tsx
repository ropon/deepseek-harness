/** Card-aware output body for the selected Tool call in details. */
import { DiffBlock, ReadBlock, SearchBlock, TerminalBlock, WebBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { ImageGallery, type MessageImageLabels } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ToolDetailsProps } from '../contract/slots.ts'
import { diffCardModel } from './models/diff-card-model.ts'
import { readCardModel } from './models/read-card-model.ts'
import { searchCardModel } from './models/search-card-model.ts'
import { terminalBlockLabels, terminalCardModel } from './models/terminal-card-model.ts'
import { resultText } from './models/tool-call-model.ts'
import { resultImages } from './models/tool-call-model.ts'
import { webCardModel } from './models/web-card-model.ts'
import css from './ToolDetails.module.css'

/** Resolve attachment labels from the conversation namespace this slot already owns. */
function imageLabels(t: ToolDetailsProps['t']): MessageImageLabels {
  return {
    image: t('image.label'),
    open: t('image.openOriginal'),
    openNamed: label => t('image.openOriginalLabel', { label }),
    loading: t('image.loading'),
    loadFailed: t('image.loadFailed'),
    lightbox: { dialog: t('image.preview'), close: t('image.closePreview') },
  }
}

/** Pure details-body inputs; framework session seats stay at the slot boundary. */
interface ToolDetailsContentProps {
  block: ToolDetailsProps['block']
  cwd?: ToolDetailsProps['cwd']
  loadImage: ToolDetailsProps['loadImage']
  t: ToolDetailsProps['t']
}

/**
 * Render the selected Tool call's structured output when its presentation
 * intent is known, otherwise preserve the flattened result text.
 * @param props - selected call slice, workspace root, and locale seat.
 * @returns the details output body.
 */
export function ToolDetails({ block, cwd, loadImage, t }: ToolDetailsContentProps) {
  const terminal = terminalCardModel(block, cwd)
  if (terminal !== null) {
    return (
      <>
        {terminal.description !== undefined ? (
          <div className={css.description}>{terminal.description}</div>
        ) : null}
        <TerminalBlock {...terminal.card} labels={terminalBlockLabels(t)} className={css.cardBody} />
      </>
    )
  }
  const read = readCardModel(block, cwd)
  if (read !== null) return <ReadBlock {...read} className={css.read} />
  const diff = diffCardModel(block)
  if (diff !== null) return <DiffBlock {...diff.card} className={css.cardBody} />
  const search = searchCardModel(block)
  if (search !== null) {
    return (
      <>
        <SearchBlock {...search.card} className={css.cardBody} />
        {search.recovery !== undefined ? <div className={css.recovery}>{search.recovery}</div> : null}
      </>
    )
  }
  const web = webCardModel(block)
  if (web !== null) {
    const body = 'kind' in block ? resultText(block) : ''
    return (
      <>
        <WebBlock {...web} className={css.web} />
        {body !== '' ? <pre className={css.code}>{body}</pre> : null}
      </>
    )
  }
  if (!('kind' in block)) return <div className={css.empty}>{t('details.running')}</div>
  const images = resultImages(block)
  const body = resultText(block)
  return (
    <>
      {images.length > 0 && (
        <div className={css.images}>
          <ImageGallery images={images} load={loadImage} align="start" labels={imageLabels(t)} />
        </div>
      )}
      {body !== '' && <pre className={css.code} data-error={block.isError || undefined}>{body}</pre>}
    </>
  )
}
