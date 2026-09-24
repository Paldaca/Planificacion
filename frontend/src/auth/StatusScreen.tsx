type Props = {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
};

/** Pantalla de estado no-feliz (sin sesión / sin acceso / portal caído). */
export function StatusScreen({ title, message, action }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
        gap: "0.75rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", margin: 0 }}>{title}</h1>
      <p style={{ color: "#555", maxWidth: "28rem", margin: 0 }}>{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 1.25rem",
            borderRadius: "0.375rem",
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
