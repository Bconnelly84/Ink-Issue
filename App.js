import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Pressable, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View
} from "react-native";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";

const COLORS = {
  bg: "#0B0D12", panel: "#151923", panel2: "#1D2430",
  text: "#F4F6FA", muted: "#A5ADBD", accent: "#F5B544",
  border: "#2A3241", green: "#7ED6A5", red: "#F08A8A"
};

async function migrateDb(db) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS catalog_publishers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS catalog_series (
      id TEXT PRIMARY KEY NOT NULL,
      publisher_id TEXT NOT NULL,
      title TEXT NOT NULL,
      volume TEXT,
      start_year INTEGER,
      FOREIGN KEY (publisher_id) REFERENCES catalog_publishers(id)
    );
    CREATE TABLE IF NOT EXISTS catalog_issues (
      id TEXT PRIMARY KEY NOT NULL,
      series_id TEXT NOT NULL,
      issue_number TEXT NOT NULL,
      title TEXT,
      cover_date TEXT,
      release_date TEXT,
      synopsis TEXT,
      source_name TEXT,
      source_url TEXT,
      FOREIGN KEY (series_id) REFERENCES catalog_series(id)
    );
    CREATE TABLE IF NOT EXISTS catalog_variants (
      id TEXT PRIMARY KEY NOT NULL,
      issue_id TEXT NOT NULL,
      cover_label TEXT,
      cover_artist TEXT,
      variant_type TEXT,
      incentive_ratio TEXT,
      image_url TEXT,
      image_source_url TEXT,
      image_attribution TEXT,
      image_status TEXT NOT NULL DEFAULT 'missing',
      FOREIGN KEY (issue_id) REFERENCES catalog_issues(id)
    );
    CREATE TABLE IF NOT EXISTS collection_items (
      id TEXT PRIMARY KEY NOT NULL,
      variant_id TEXT NOT NULL,
      copy_count INTEGER NOT NULL DEFAULT 1,
      condition_note TEXT,
      grade TEXT,
      purchase_price REAL,
      purchase_date TEXT,
      storage_location TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'local',
      FOREIGN KEY (variant_id) REFERENCES catalog_variants(id)
    );
    CREATE TABLE IF NOT EXISTS local_sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_issues_series ON catalog_issues(series_id);
    CREATE INDEX IF NOT EXISTS idx_variants_issue ON catalog_variants(issue_id);
    CREATE INDEX IF NOT EXISTS idx_collection_variant ON collection_items(variant_id);
  `);

  const count = await db.getFirstAsync("SELECT COUNT(*) AS n FROM catalog_publishers");
  if (count.n === 0) {
    // Clearly labeled starter records. Replace/extend these with licensed catalog imports.
    await db.runAsync("INSERT INTO catalog_publishers (id, name) VALUES (?, ?)", "demo-pub-1", "Sample Publisher");
    await db.runAsync(
      "INSERT INTO catalog_series (id, publisher_id, title, volume, start_year) VALUES (?, ?, ?, ?, ?)",
      "demo-series-1", "demo-pub-1", "The Midnight Signal (Demo)", "Volume 1", 2025
    );
    await db.runAsync(
      `INSERT INTO catalog_issues
       (id, series_id, issue_number, title, cover_date, release_date, synopsis, source_name, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "demo-issue-1", "demo-series-1", "1", "The First Transmission",
      "2025-01", "2025-01-15",
      "DEMO SYNOPSIS: A strange transmission reaches a small town after midnight. One amateur radio operator follows the signal and discovers that its source may be closer than anyone expects. This placeholder story is fictional and is not a real published comic.",
      "In-app demo data", null
    );
    await db.runAsync(
      `INSERT INTO catalog_variants
       (id, issue_id, cover_label, cover_artist, variant_type, image_url, image_source_url, image_attribution, image_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "demo-variant-a", "demo-issue-1", "A", "Demo Artist", "Standard",
      null, null, null, "missing"
    );
    await db.runAsync(
      `INSERT INTO catalog_variants
       (id, issue_id, cover_label, cover_artist, variant_type, image_url, image_source_url, image_attribution, image_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "demo-variant-b", "demo-issue-1", "B", "Demo Artist", "Variant",
      null, null, null, "missing"
    );
  }
}

function Cover({ uri, title, large = false }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.cover, large && styles.coverLarge]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.coverFallback}>
          <Text style={styles.coverFallbackMark}>CC</Text>
          <Text style={styles.coverFallbackText}>COVER{'\n'}UNAVAILABLE</Text>
        </View>
      )}
    </View>
  );
}

function AppShell() {
  const db = useSQLiteContext();
  const [tab, setTab] = useState("Catalog");
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState([]);
  const [collection, setCollection] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const found = await db.getAllAsync(`
        SELECT i.*, s.title AS series_title, s.start_year,
               p.name AS publisher_name,
               (SELECT COUNT(*) FROM catalog_variants v WHERE v.issue_id = i.id) AS variant_count,
               (SELECT v.image_url FROM catalog_variants v
                 WHERE v.issue_id = i.id AND v.image_url IS NOT NULL
                 ORDER BY v.cover_label LIMIT 1) AS cover_image_url
        FROM catalog_issues i
        JOIN catalog_series s ON s.id = i.series_id
        JOIN catalog_publishers p ON p.id = s.publisher_id
        ORDER BY s.title, CAST(i.issue_number AS INTEGER)
      `);
      setIssues(found);
      const owned = await db.getAllAsync(`
        SELECT c.*, v.cover_label, v.image_url, i.issue_number, i.title AS issue_title,
               s.title AS series_title
        FROM collection_items c
        JOIN catalog_variants v ON v.id = c.variant_id
        JOIN catalog_issues i ON i.id = v.issue_id
        JOIN catalog_series s ON s.id = i.series_id
        ORDER BY c.updated_at DESC
      `);
      setCollection(owned);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const filteredIssues = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(x =>
      [x.series_title, x.issue_number, x.title, x.publisher_name, x.synopsis]
        .some(v => String(v || "").toLowerCase().includes(q))
    );
  }, [issues, query]);

  async function openIssue(issue) {
    setSelectedIssue(issue);
    const found = await db.getAllAsync(
      "SELECT * FROM catalog_variants WHERE issue_id = ? ORDER BY cover_label",
      issue.id
    );
    setVariants(found);
    setSelectedVariant(null);
  }

  async function addVariant(variant) {
    const existing = await db.getFirstAsync(
      "SELECT * FROM collection_items WHERE variant_id = ? LIMIT 1", variant.id
    );
    const now = new Date().toISOString();
    if (existing) {
      await db.runAsync(
        "UPDATE collection_items SET copy_count = copy_count + 1, updated_at = ?, sync_status = 'local' WHERE id = ?",
        now, existing.id
      );
    } else {
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await db.runAsync(
        `INSERT INTO collection_items (id, variant_id, copy_count, updated_at, sync_status)
         VALUES (?, ?, 1, ?, 'local')`,
        id, variant.id, now
      );
    }
    await db.runAsync(
      `INSERT INTO local_sync_queue (id, entity_type, entity_id, operation, payload_json, created_at)
       VALUES (?, 'collection_item', ?, 'upsert', ?, ?)`,
      `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      variant.id, JSON.stringify({ variant_id: variant.id }), now
    );
    setSelectedIssue(null);
    setSelectedVariant(null);
    await refresh();
    setTab("Collection");
  }

  async function removeCopy(item) {
    if (item.copy_count > 1) {
      await db.runAsync(
        "UPDATE collection_items SET copy_count = copy_count - 1, updated_at = ?, sync_status = 'local' WHERE id = ?",
        new Date().toISOString(), item.id
      );
    } else {
      await db.runAsync("DELETE FROM collection_items WHERE id = ?", item.id);
    }
    await refresh();
  }

  function Header() {
    return (
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR COMIC UNIVERSE</Text>
          <Text style={styles.brand}>PANEL <Text style={{ color: COLORS.accent }}>BY PANEL</Text></Text>
        </View>
        <View style={styles.onlinePill}><View style={styles.onlineDot}/><Text style={styles.onlineText}>LOCAL MODE</Text></View>
      </View>
    );
  }

  function IssueCard({ item }) {
    return (
      <Pressable style={styles.issueCard} onPress={() => openIssue(item)}>
        <Cover uri={item.cover_image_url} title={item.series_title} />
        <View style={styles.issueInfo}>
          <Text style={styles.publisher}>{item.publisher_name}</Text>
          <Text style={styles.issueTitle} numberOfLines={2}>{item.series_title} #{item.issue_number}</Text>
          {!!item.title && <Text style={styles.muted} numberOfLines={1}>{item.title}</Text>}
          <Text style={styles.plot} numberOfLines={3}>{item.synopsis || "Plot summary not available yet."}</Text>
          <Text style={styles.variantCount}>{item.variant_count} cover variant{item.variant_count === 1 ? "" : "s"}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  }

  function CatalogView() {
    return (
      <>
        <Text style={styles.pageTitle}>Catalog</Text>
        <Text style={styles.pageSub}>Find an issue. Track every cover.</Text>
        <TextInput
          style={styles.search}
          placeholder="Search series, issue, publisher, plot…"
          placeholderTextColor={COLORS.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <Text style={styles.sectionLabel}>{filteredIssues.length} ISSUE{filteredIssues.length === 1 ? "" : "S"} IN THIS SAMPLE CATALOG</Text>
        {loading ? <ActivityIndicator color={COLORS.accent} style={{ marginTop: 30 }} /> :
          <FlatList
            data={filteredIssues}
            keyExtractor={x => x.id}
            renderItem={({ item }) => <IssueCard item={item} />}
            contentContainerStyle={{ paddingBottom: 28 }}
            ListEmptyComponent={<Text style={styles.empty}>No matching issues. Later versions will connect the licensed cloud catalog.</Text>}
          />
        }
      </>
    );
  }

  function CollectionView() {
    return (
      <>
        <Text style={styles.pageTitle}>My Collection</Text>
        <Text style={styles.pageSub}>Saved on this device. Cloud sync comes in a later milestone.</Text>
        {collection.length === 0 ? (
          <View style={styles.emptyPanel}>
            <Text style={styles.emptyIcon}>▤</Text>
            <Text style={styles.emptyTitle}>Your long boxes start here.</Text>
            <Text style={styles.muted}>Open a catalog issue and add the exact cover you own.</Text>
            <Pressable style={styles.primaryButton} onPress={() => setTab("Catalog")}><Text style={styles.primaryButtonText}>Browse catalog</Text></Pressable>
          </View>
        ) : (
          <FlatList
            data={collection}
            keyExtractor={x => x.id}
            renderItem={({ item }) => (
              <View style={styles.issueCard}>
                <Cover uri={item.image_url} />
                <View style={styles.issueInfo}>
                  <Text style={styles.issueTitle}>{item.series_title} #{item.issue_number}</Text>
                  <Text style={styles.muted}>Cover {item.cover_label || "—"} · {item.copy_count} cop{item.copy_count === 1 ? "y" : "ies"}</Text>
                  <Pressable onPress={() => removeCopy(item)} style={styles.smallButton}><Text style={styles.smallButtonText}>Remove one copy</Text></Pressable>
                </View>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 28 }}
          />
        )}
      </>
    );
  }

  function IssueDetail() {
    if (!selectedIssue) return null;
    return (
      <View style={styles.detailOverlay}>
        <View style={styles.detailHeader}>
          <Pressable onPress={() => { setSelectedIssue(null); setSelectedVariant(null); }}><Text style={styles.backText}>‹ Back to catalog</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <Text style={styles.publisher}>{selectedIssue.publisher_name}</Text>
          <Text style={styles.pageTitle}>{selectedIssue.series_title} #{selectedIssue.issue_number}</Text>
          {!!selectedIssue.title && <Text style={styles.pageSub}>{selectedIssue.title}</Text>}
          <Text style={styles.sectionLabel}>ISSUE PLOT</Text>
          <Text style={styles.plotFull}>{selectedIssue.synopsis || "Plot summary not available yet."}</Text>
          <Text style={styles.sectionLabel}>COVER VARIANTS ({variants.length})</Text>
          {variants.map(v => (
            <Pressable key={v.id} style={[styles.variantRow, selectedVariant?.id === v.id && styles.variantSelected]} onPress={() => setSelectedVariant(v)}>
              <Cover uri={v.image_url} />
              <View style={styles.issueInfo}>
                <Text style={styles.issueTitle}>Cover {v.cover_label || "Unlettered"}</Text>
                <Text style={styles.muted}>{v.variant_type || "Edition"}{v.cover_artist ? ` · ${v.cover_artist}` : ""}</Text>
                {!!v.incentive_ratio && <Text style={styles.muted}>Incentive: {v.incentive_ratio}</Text>}
                {!v.image_url && <Text style={styles.imageNote}>Cover image not yet sourced</Text>}
              </View>
              <View style={[styles.radio, selectedVariant?.id === v.id && styles.radioActive]} />
            </Pressable>
          ))}
          <Pressable
            disabled={!selectedVariant}
            style={[styles.primaryButton, !selectedVariant && styles.disabledButton]}
            onPress={() => addVariant(selectedVariant)}
          >
            <Text style={styles.primaryButtonText}>Add selected cover to collection</Text>
          </Pressable>
          <Text style={styles.disclaimer}>Demo catalog only. Real plot summaries and cover images will be populated from sources approved for reuse.</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <Header />
      <View style={styles.content}>
        {tab === "Catalog" ? <CatalogView /> : <CollectionView />}
      </View>
      <View style={styles.tabBar}>
        {["Catalog", "Collection"].map(t => (
          <Pressable key={t} onPress={() => { setSelectedIssue(null); setTab(t); }} style={styles.tabItem}>
            <Text style={[styles.tabIcon, tab === t && styles.tabActive]}>{t === "Catalog" ? "▦" : "▤"}</Text>
            <Text style={[styles.tabLabel, tab === t && styles.tabActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {!!selectedIssue && <IssueDetail />}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SQLiteProvider databaseName="comic-collector.db" onInit={migrateDb}>
      <AppShell />
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderColor: COLORS.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: COLORS.muted, fontSize: 9, fontWeight: "800", letterSpacing: 2 },
  brand: { color: COLORS.text, fontSize: 20, fontWeight: "900", letterSpacing: 0.5, marginTop: 3 },
  onlinePill: { borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  onlineText: { color: COLORS.muted, fontSize: 9, fontWeight: "800" },
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 20 },
  pageTitle: { color: COLORS.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  pageSub: { color: COLORS.muted, fontSize: 13, marginTop: 5, marginBottom: 18, lineHeight: 19 },
  search: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, marginBottom: 18, fontSize: 14 },
  sectionLabel: { color: COLORS.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 10, marginBottom: 12 },
  issueCard: { flexDirection: "row", gap: 12, backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: 14, marginBottom: 10, alignItems: "flex-start" },
  cover: { width: 76, height: 108, backgroundColor: COLORS.panel2, borderRadius: 6, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  coverLarge: { width: 128, height: 180 },
  coverFallback: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", padding: 5, borderWidth: 1, borderColor: "#3A4354" },
  coverFallbackMark: { color: COLORS.accent, fontSize: 24, fontWeight: "900" },
  coverFallbackText: { color: COLORS.muted, fontSize: 8, textAlign: "center", fontWeight: "800", marginTop: 6, letterSpacing: 1 },
  issueInfo: { flex: 1, paddingTop: 2 },
  publisher: { color: COLORS.accent, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  issueTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", marginTop: 5, lineHeight: 20 },
  muted: { color: COLORS.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  plot: { color: "#CDD3DF", fontSize: 11, lineHeight: 16, marginTop: 7 },
  plotFull: { color: "#D9DEEA", fontSize: 14, lineHeight: 22, marginBottom: 14 },
  variantCount: { color: COLORS.green, fontSize: 10, fontWeight: "800", marginTop: 8 },
  chevron: { color: COLORS.muted, fontSize: 25, paddingHorizontal: 3, alignSelf: "center" },
  tabBar: { borderTopWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg, flexDirection: "row", paddingTop: 10, paddingBottom: 8 },
  tabItem: { flex: 1, alignItems: "center", gap: 4 },
  tabIcon: { color: COLORS.muted, fontSize: 19 },
  tabLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  tabActive: { color: COLORS.accent },
  empty: { color: COLORS.muted, fontSize: 13, lineHeight: 20, paddingVertical: 24 },
  emptyPanel: { alignItems: "center", backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, padding: 24, borderRadius: 16, marginTop: 10 },
  emptyIcon: { fontSize: 34, color: COLORS.accent, marginBottom: 10 },
  emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: "800" },
  primaryButton: { backgroundColor: COLORS.accent, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 10, alignItems: "center", marginTop: 16 },
  primaryButtonText: { color: "#17130B", fontSize: 13, fontWeight: "900" },
  smallButton: { alignSelf: "flex-start", borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, marginTop: 10 },
  smallButtonText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  detailOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: COLORS.bg, paddingTop: 14, paddingHorizontal: 20 },
  detailHeader: { paddingBottom: 16 },
  backText: { color: COLORS.accent, fontWeight: "800", fontSize: 14 },
  variantRow: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: 12, marginBottom: 9 },
  variantSelected: { borderColor: COLORS.accent },
  imageNote: { color: COLORS.red, fontSize: 10, marginTop: 6 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: COLORS.muted },
  radioActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  disabledButton: { opacity: 0.45 },
  disclaimer: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 14, marginBottom: 20 }
});
