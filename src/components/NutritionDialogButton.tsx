import type { Nutritions } from 'shared/nutritions';
import { NutritionTable } from './NutritionTable';

export const NutritionDialogButton = ({
  nutritions,
}: {
  nutritions: Nutritions | undefined;
}) => {
  if (!nutritions) {
    return null;
  }

  return (
    <>
      <button
        className="btn btn-info"
        onClick={() =>
          (
            document.getElementById('nutritions-modal') as HTMLDialogElement
          ).showModal()
        }
        type="button"
      >
        영앙정보 보기
      </button>
      <dialog className="modal" id="nutritions-modal">
        <div className="modal-box w-auto p-0">
          <NutritionTable nutritions={nutritions} />
        </div>
        <form className="modal-backdrop" method="dialog">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  );
};
