import { useEffect, useState } from 'react';
import { Alert, Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { routeRequest } from '../../services/routes';
export default function DriverContactEditor({ visible, phone, onClose, onSave }: { visible: boolean; phone?: string; onClose: () => void; onSave: (phone: string) => void }) {
  const [value, setValue] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setValue(phone || ''); }, [visible, phone]);
  async function save() {
    if (busy) return;
    setBusy(true);
    try { const result = await routeRequest('/driver/me/contact', { phone: value }, 'PATCH'); onSave(result.driver.phone); onClose(); }
    catch (e) { Alert.alert('Could not save contact', e instanceof Error ? e.message : 'Please retry.'); }
    finally { setBusy(false); }
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.card}><Text style={styles.title}>Driver contact number</Text><Text style={styles.body}>Parents linked to your assigned bus can use this number to contact you.</Text><TextInput accessibilityLabel="Driver phone number" value={value} onChangeText={setValue} keyboardType="phone-pad" autoComplete="tel" placeholder="10-digit number or +country code" style={styles.input} maxLength={24} /><View style={styles.row}><TouchableOpacity disabled={busy} onPress={onClose} style={styles.cancel}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={busy || !value.trim()} onPress={save} style={styles.save}><Text style={styles.white}>{busy ? 'Saving…' : 'Save Number'}</Text></TouchableOpacity></View></View></View></Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: '#0f172a80', justifyContent: 'center', padding: 20 }, card: { padding: 20, borderRadius: 20, backgroundColor: '#fff' }, title: { fontSize: 20, fontWeight: '800', color: '#172554' }, body: { fontSize: 14, color: '#64748b', lineHeight: 21, marginVertical: 12 }, input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, color: '#172554' }, row: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 }, cancel: { padding: 12 }, save: { padding: 12, borderRadius: 10, backgroundColor: '#087cf0' }, white: { color: '#fff', fontWeight: '700' } });
