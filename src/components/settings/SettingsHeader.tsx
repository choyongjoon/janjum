import { BackLink } from '../BackLink';

export function SettingsHeader({
  isInitialSetup,
}: {
  isInitialSetup: boolean;
}) {
  return (
    <div className="mb-6">
      {!isInitialSetup && <BackLink to="/profile">프로필</BackLink>}

      <h1 className="font-bold text-3xl">
        {isInitialSetup ? '환영합니다!' : '설정'}
      </h1>

      <p className="mt-2 text-base-content/70">
        {isInitialSetup
          ? '잔점에 오신 것을 환영합니다! 프로필을 설정해주세요.'
          : ''}
      </p>

      {isInitialSetup && (
        <div className="alert alert-info mt-4">
          <span>
            처음 가입하셨군요! 이름과 핸들을 설정하여 다른 사용자들과 구별되는
            프로필을 만들어보세요.
          </span>
        </div>
      )}
    </div>
  );
}
