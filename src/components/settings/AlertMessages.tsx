interface AlertMessagesProps {
  successMessage: string;
  errorMessage: string;
}

export function AlertMessages({
  successMessage,
  errorMessage,
}: AlertMessagesProps) {
  if (!(successMessage || errorMessage)) {
    return null;
  }

  return (
    <div className="mb-6">
      {successMessage && (
        <div className="alert alert-success mb-4">
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-error">
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
