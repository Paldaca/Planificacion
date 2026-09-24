import type { Identity } from "../auth/useIdentity";

const card: React.CSSProperties = {
  border: "1px solid var(--border, #e5e4e7)",
  borderRadius: "0.5rem",
  padding: "1rem 1.25rem",
  marginBottom: "1rem",
};

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.6rem",
        marginRight: "0.5rem",
        borderRadius: "999px",
        fontSize: "0.8rem",
        border: `1px solid ${on ? "#4f46e5" : "#d4d4d8"}`,
        color: on ? "#4f46e5" : "#71717a",
      }}
    >
      {label}: {on ? "sí" : "no"}
    </span>
  );
}

/**
 * Pantalla de inicio del módulo.
 *
 * Todo lo que muestra sale del sistema de permisos del Portal: para llegar
 * acá el usuario tuvo que tener el módulo `planificacion` asignado en
 * `core_usuario_modulo` (o ser superadmin) — si no, el backend habría
 * devuelto 403 y la SPA estaría mostrando la pantalla "Sin acceso".
 */
export function Home({ identity }: { identity: Identity }) {
  const nombre =
    [identity.first_name, identity.last_name].filter(Boolean).join(" ") ||
    identity.username;

  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "48rem",
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ marginTop: 0 }}>Planificación</h1>

      <div style={card}>
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Tu sesión</h2>
        <p style={{ margin: "0 0 0.25rem" }}>
          <strong>{nombre}</strong>
          {identity.email ? ` · ${identity.email}` : ""}
        </p>
        <p style={{ margin: 0, color: "#71717a", fontSize: "0.875rem" }}>
          Rol: {identity.rol}
          {identity.disciplina ? ` · Disciplina: ${identity.disciplina}` : ""}
          {identity.perfil ? ` · Perfil: ${identity.perfil}` : ""}
        </p>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.75rem" }}>
          Permisos (según el Portal)
        </h2>
        <Chip label="Acceso al módulo" on />
        <Chip label="Administrador del módulo" on={identity.es_administrador} />
        <Chip label="Superadmin" on={identity.es_superadmin} />
        {identity.modulos.length > 0 && (
          <p style={{ margin: "0.75rem 0 0", color: "#71717a", fontSize: "0.8rem" }}>
            Módulos de la Suite asignados: {identity.modulos.join(", ")}
          </p>
        )}
      </div>

      {identity.es_administrador && (
        <div style={{ ...card, borderColor: "#4f46e5" }}>
          <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem", color: "#4f46e5" }}>
            Administración del módulo
          </h2>
          <p style={{ margin: 0, color: "#71717a", fontSize: "0.875rem" }}>
            Esta sección solo la ven los administradores del módulo. Todavía no
            hay acciones de negocio: es el punto de anclaje para las que vengan.
          </p>
        </div>
      )}

      <p style={{ color: "#a1a1aa", fontSize: "0.8rem" }}>
        Sin módulos de negocio todavía — esta pantalla verifica que la
        identidad y los permisos del Portal llegan correctamente.
      </p>
    </div>
  );
}
