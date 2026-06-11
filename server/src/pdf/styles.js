'use strict';

// Plain style objects (no StyleSheet.create) so this module has no dependency
// on @react-pdf/renderer and can be required from CommonJS without pulling the
// ESM renderer into the module graph. @react-pdf accepts plain style objects.
const styles = {
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#1a202c' },
  clubName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#173e6e' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  subtitle: { fontSize: 10, color: '#4a5568', marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4, color: '#173e6e' },
  revision: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#fffbeb',
    borderLeftWidth: 3,
    borderLeftColor: '#d97706',
  },
  revisionTitle: { fontFamily: 'Helvetica-Bold', color: '#92400e' },
  revisionBody: { color: '#92400e', marginTop: 2 },
  table: { marginTop: 4, borderWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headRow: { backgroundColor: '#f1f5f9' },
  cell: { padding: 4, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  headCell: { fontFamily: 'Helvetica-Bold' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    textAlign: 'center',
    fontSize: 8,
    color: '#94a3b8',
  },
};

module.exports = { styles };
