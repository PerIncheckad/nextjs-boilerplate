'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './operational-topbar-meta.module.css';

type OperationalTopbarMetaProps = {
  mode: string;
  children?: ReactNode;
};

const capitalize = (value: string): string => {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const fullNameFromEmail = (email: string): string => {
  if (!email) return '';
  const namePart = email.split('@')[0] || '';
  const parts = namePart.split('.').filter(Boolean);
  if (parts.length >= 2) return `${capitalize(parts[0])} ${capitalize(parts[1])}`;
  return capitalize(parts[0] || '');
};

export default function OperationalTopbarMeta({ mode, children }: OperationalTopbarMetaProps) {
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      setFullName(fullNameFromEmail(user?.email || ''));
    };

    void loadUser();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={styles.meta}>
      {fullName && <span className={styles.user}>Inloggad: {fullName}</span>}
      {children}
      <span className={styles.mode}>{mode}</span>
    </div>
  );
}
