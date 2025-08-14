import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="prose prose-lg max-w-none">
        <h1 className="mb-8 font-bold text-3xl">잔점 개인정보 처리 방침</h1>

        <div className="mb-6 text-base leading-relaxed">
          잔점은 정보주체의 자유와 권리 보호를 위해 ｢개인정보 보호법｣ 및 관계
          법령이 정한 바를 준수하여, 적법하게 개인정보를 처리하고 안전하게
          관리하고 있습니다. 이에 ｢개인정보 보호법｣ 제30조에 따라 정보주체에게
          개인정보의 처리와 보호에 관한 절차 및 기준을 안내하고, 이와 관련한
          고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이
          개인정보 처리방침을 수립·공개합니다.
        </div>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">개인정보의 처리 목적</h2>
          <p className="text-base">회원 가입 및 관리</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">
            처리하는 개인정보의 항목
          </h2>
          <div className="text-base">
            <p className="mb-2 font-medium">
              1. 정보주체의 동의를 받지 않고 처리하는 개인정보 항목
            </p>
            <p className="ml-4">
              - 이용자 고유 식별자 (법적 근거: 「개인정보 보호법」
              제15조제1항제4호)
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">
            개인정보의 처리 및 보유 기간
          </h2>
          <p className="text-base">회원탈퇴시까지</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">
            개인정보의 파기 절차 및 방법에 관한 사항
          </h2>
          <p className="text-base">
            개인정보 보유기간이 경과하였을 때 지체없이 해당 개인정보를
            파기합니다.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">
            개인정보의 안전성 확보조치에 관한 사항
          </h2>
          <p className="text-base">
            개인정보처리시스템에 대한 접근 권한의 관리
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">
            정보주체와 법정대리인의 권리·의무 및 행사방법에 관한 사항
          </h2>
          <p className="text-base">
            정보주체는 언제든지 홈페이지 '설정'의 '회원탈퇴'를 통해 개인정보를
            직접 삭제할 수 있습니다.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">
            개인정보 보호책임자의 성명 또는 개인정보 업무 담당부서 및 고충사항을
            처리하는 부서에 관한 사항
          </h2>
          <div className="text-base">
            <p className="mb-2 font-medium">개인정보 보호책임자</p>
            <p className="ml-4">성명: 조용준</p>
            <p className="ml-4">연락처: contact@janjum.com</p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">
            정보주체의 권익침해에 대한 구제방법
          </h2>
          <div className="text-base">
            <p className="mb-4">
              정보주체는 개인정보침해로 인한 구제를 받기 위하여 개인정보
              분쟁조정위원회, 한국인터넷진흥원 개인정보침해 신고센터 등에
              분쟁해결이나 상담 등을 신청할 수 있습니다. 이 밖에 기타
              개인정보침해의 신고, 상담에 대하여는 아래의 기관에 문의하시기
              바랍니다.
            </p>
            <ul className="list-inside list-decimal space-y-1">
              <li>
                개인정보 분쟁조정위원회 : (국번없이) 1833-6972
                (www.kopico.go.kr)
              </li>
              <li>
                개인정보침해 신고센터 : (국번없이) 118 (privacy.kisa.or.kr)
              </li>
              <li>경찰청 : (국번없이) 182 (ecrm.police.go.kr)</li>
            </ul>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 font-semibold text-2xl">
            개인정보 처리방침의 변경에 관한 사항
          </h2>
          <p className="text-base">
            이 개인정보 처리방침은 2025. 8. 15부터 적용됩니다.
          </p>
        </section>
      </div>
    </div>
  );
}
