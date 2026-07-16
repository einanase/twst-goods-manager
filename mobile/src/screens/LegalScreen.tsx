import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { colors } from '../lib/theme';

type LegalDocKey = 'terms' | 'privacy' | 'contact' | 'deleteAccount';
type LegalDoc = {
  key: LegalDocKey;
  title: string;
  summary: string;
  sections: Array<{
    heading: string;
    body: string[];
  }>;
};

const updatedAt = '2026年7月16日';

const legalDocs: LegalDoc[] = [
  {
    key: 'terms',
    title: '利用規約',
    summary: 'グッとれの利用条件と、交換・譲渡取引に関する注意事項です。',
    sections: [
      {
        heading: '本サービスについて',
        body: [
          'グッとれは、グッズ交換・譲渡に関する在庫、取引相手、進行状況、画像、メモを利用者自身が管理するためのアプリです。',
          '本アプリは利用者間の交換・譲渡取引を補助する管理ツールであり、取引の成立、履行、相手方の本人確認、配送、支払い等を保証するものではありません。',
        ],
      },
      {
        heading: '利用者の責任',
        body: [
          '利用者は、登録する情報が第三者の権利を侵害しないよう注意し、各取引を自己の責任で行うものとします。',
          'X ID、住所、氏名、画像、メモなど個人情報に該当しうる情報を入力する場合、利用者自身が管理の必要性を判断してください。',
        ],
      },
      {
        heading: '禁止事項',
        body: [
          '法令または公序良俗に反する利用、第三者の権利を侵害する利用、虚偽情報の登録、サービスの運営を妨害する行為を禁止します。',
          '著作権、商標権、肖像権その他の権利を侵害する画像や情報を保存・共有しないでください。',
        ],
      },
      {
        heading: '免責',
        body: [
          '本アプリの利用により発生した取引上のトラブル、配送事故、支払いトラブル、データ入力ミス等について、運営者は法令上認められる範囲で責任を負いません。',
          'クラウド同期、画像保存、通知機能等は、通信環境や外部サービスの状態により一時的に利用できない場合があります。',
        ],
      },
      {
        heading: '変更',
        body: [
          '運営者は、必要に応じて本規約を変更できます。重要な変更がある場合は、アプリ内または適切な方法で通知します。',
        ],
      },
    ],
  },
  {
    key: 'privacy',
    title: 'プライバシーポリシー',
    summary: '保存するデータ、利用目的、第三者サービス、削除についての説明です。',
    sections: [
      {
        heading: '取得・保存する情報',
        body: [
          'アカウント認証のためのメールアドレス、在庫情報、取引情報、取引相手名やX IDとして入力された文字列、メモ、画像、発送予定日、受取予定日、進行状況を保存します。',
          '利用者が画像を選択または撮影した場合、その画像をクラウドストレージに保存します。端末内の写真やカメラへは、利用者が許可した場合のみアクセスします。',
        ],
      },
      {
        heading: '利用目的',
        body: [
          '取得した情報は、ログイン、クラウド同期、在庫・取引管理、画像表示、期限超過通知、問い合わせ対応、セキュリティ維持、サービス改善のために利用します。',
          'アプリ内通知は、発送予定日や受取予定日を過ぎた取引を利用者に知らせるために利用します。',
        ],
      },
      {
        heading: '第三者サービス',
        body: [
          '本アプリは、認証、データベース、画像保存のためにSupabaseを利用します。',
          '将来プッシュ通知を提供する場合、Expo Push Service、Apple Push Notification service、Firebase Cloud Messaging等を利用する可能性があります。',
          '運営者は、法令に基づく場合を除き、利用者の個人情報を本人の同意なく第三者に販売しません。',
        ],
      },
      {
        heading: 'データの管理と削除',
        body: [
          '利用者の在庫、取引、画像はアカウントごとに分離して保存されます。他の利用者が閲覧できないよう、アクセス制御を設定します。',
          'アカウント削除の依頼を受けた場合、本人確認後、アカウントに紐づく在庫、取引、画像等の削除を行います。ただし、法令上保存が必要な情報がある場合はその範囲で保持することがあります。',
        ],
      },
      {
        heading: 'プライバシーポリシーの変更',
        body: [
          '本ポリシーを変更する場合、重要な変更についてはアプリ内または適切な方法で通知します。',
        ],
      },
    ],
  },
  {
    key: 'contact',
    title: 'お問い合わせ',
    summary: '不具合、データ削除、利用方法に関する問い合わせ窓口です。',
    sections: [
      {
        heading: 'お問い合わせ方法',
        body: [
          '正式公開前のため、問い合わせ先は準備中です。公開前にサポート用メールアドレスまたは問い合わせフォームを設定します。',
          '問い合わせ時には、登録メールアドレス、発生した画面、操作内容、エラーメッセージ、端末種別を添えてください。パスワードは送信しないでください。',
        ],
      },
      {
        heading: '対応内容',
        body: [
          'ログイン、同期、画像表示、通知、アカウント削除、データ削除依頼、不具合報告、利用方法に関する問い合わせを受け付けます。',
          'グッズ交換・譲渡の相手方とのトラブル、配送、支払い、返金、真贋等については、当事者間での解決をお願いします。',
        ],
      },
    ],
  },
  {
    key: 'deleteAccount',
    title: 'アカウント削除方法',
    summary: 'アカウントと保存データの削除依頼についての説明です。',
    sections: [
      {
        heading: '削除対象',
        body: [
          'アカウント削除では、ログイン用アカウント、在庫データ、取引データ、保存画像、メモ、通知判定に使う予定日等を削除対象とします。',
          '削除後はデータを復元できない場合があります。必要な情報は削除前に利用者自身で控えてください。',
        ],
      },
      {
        heading: '削除依頼の手順',
        body: [
          '正式公開前のため、削除依頼の受付窓口は準備中です。公開前に、アプリ内またはWebページからアカウント削除を依頼できる導線を設置します。',
          '削除依頼時には、登録メールアドレスで本人確認を行います。確認が完了した後、対象データの削除処理を行います。',
        ],
      },
      {
        heading: '今後の実装予定',
        body: [
          '販売版では、利用者がアプリ内からアカウント削除を依頼または実行できる機能を提供する予定です。',
          'App StoreやGoogle Playで公開する場合、各ストアの要件に合わせて、アカウント削除の説明ページや削除導線を整備します。',
        ],
      },
    ],
  },
];

export function LegalScreen() {
  const [selectedDoc, setSelectedDoc] = useState<LegalDoc | null>(null);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.title}>設定・サポート</Text>
          <Text style={styles.body}>
            販売準備用の規約、プライバシー、問い合わせ、アカウント削除方法を確認できます。
          </Text>
          <Text style={styles.updated}>最終更新: {updatedAt}</Text>
        </View>

        {legalDocs.map((doc) => (
          <Pressable
            key={doc.key}
            accessibilityRole="button"
            onPress={() => setSelectedDoc(doc)}
            style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
          >
            <Text style={styles.cardTitle}>{doc.title}</Text>
            <Text style={styles.cardSummary}>{doc.summary}</Text>
          </Pressable>
        ))}

        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>公開前に必要な確認</Text>
          <Text style={styles.noticeText}>
            この文面は開発用の叩き台です。正式公開前に、運営者名、問い合わせ先、削除受付方法、課金条件を確定し、必要に応じて専門家確認を行ってください。
          </Text>
        </View>
      </ScrollView>

      <LegalDocModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
    </View>
  );
}

function LegalDocModal({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  if (!doc) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleBlock}>
            <Text style={styles.modalTitle}>{doc.title}</Text>
            <Text style={styles.updated}>最終更新: {updatedAt}</Text>
          </View>
          <AppButton label="閉じる" variant="ghost" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {doc.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.heading}</Text>
              {section.body.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 36,
  },
  intro: {
    gap: 6,
    paddingBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  updated: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  cardPressed: {
    opacity: 0.78,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  cardSummary: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  noticeBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
    padding: 14,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  noticeText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  modalRoot: {
    backgroundColor: colors.background,
    flex: 1,
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 16,
  },
  modalTitleBlock: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  modalContent: {
    gap: 18,
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  paragraph: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
});
