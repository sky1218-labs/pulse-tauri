import React, { useEffect, useRef, useState } from "react";
import { useLibrary } from "../../store";
import { tap } from "../../utils/haptics";
import { backNav } from "../../utils/backNav";
import { Icon } from "./Icon";
import btn from "./Button.module.css";
import styles from "./Dialog.module.css";

export function Dialog({ title, children, onClose, centered, bare, radius, tone, pad32 }: {
  title: string; children: React.ReactNode; onClose: () => void;
  centered?: boolean; bare?: boolean;
  radius?: "r12" | "r28"; tone?: "elevated"; pad32?: boolean;
}) {
  // Backdrop-tap dismissal plays the exit animation before unmounting;
  // button-driven closes are parent-controlled and unmount immediately.
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 180);
  };
  // Android back closes the topmost dialog before it navigates/exits.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => backNav.register(() => {
    requestCloseRef.current();
    return true;
  }), []);
  const dialogClass = [
    styles.dialog,
    centered ? styles.centered : "",
    bare ? styles.bare : "",
    radius === "r12" ? styles.r12 : radius === "r28" ? styles.r28 : "",
    tone === "elevated" ? styles.onElevated : "",
    pad32 ? styles.pad32 : "",
  ].filter(Boolean).join(" ");
  return (
    <div
      className={`${styles.backdrop}${centered ? ` ${styles.backdropCenter}` : ""}${closing ? ` ${styles.backdropClosing}` : ""}`}
      onClick={requestClose}
    >
      <div className={dialogClass} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, message, confirmLabel, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useLibrary();
  return (
    <Dialog title={title} onClose={onCancel} centered bare radius="r12" tone="elevated">
      <div className={styles.confirmHead}>
        <Icon name="warning" />
        <h2>{title}</h2>
      </div>
      <p>{message}</p>
      <div className={styles.dialogActions}>
        <button className={`${btn.btnText} ${btn.btnTextNeutral}`} onClick={onCancel}>{t("cancel")}</button>
        <button className={`${btn.btnText} ${btn.btnTextDanger}`} onClick={() => { tap(); onConfirm(); }}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}
