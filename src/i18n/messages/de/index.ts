// Deutsche Texte (Schweizer Schreibweise: "ss" statt "ß"). Gleiche Schlüssel wie ../en/.
// Die Rolle pro Event heisst "Lead"; "du" für alle Ansprachen.
// Eine Datei pro Namespace, wie in ../en/.
import type { Messages } from "../en";
import { addMember } from "./addMember";
import { admin } from "./admin";
import { adminDonations } from "./adminDonations";
import { adminLog } from "./adminLog";
import { adminSettings } from "./adminSettings";
import { attendees } from "./attendees";
import { audit } from "./audit";
import { auditLog } from "./auditLog";
import { auth } from "./auth";
import { backups } from "./backups";
import { bot } from "./bot";
import { changelog } from "./changelog";
import { chart } from "./chart";
import { chat } from "./chat";
import { checklist } from "./checklist";
import { claimGuest } from "./claimGuest";
import { claimLink } from "./claimLink";
import { clanForm } from "./clanForm";
import { clanHeader } from "./clanHeader";
import { clanPage } from "./clanPage";
import { clans } from "./clans";
import { clanSettings } from "./clanSettings";
import { cmd } from "./cmd";
import { colors } from "./colors";
import { common } from "./common";
import { contacts } from "./contacts";
import { costs } from "./costs";
import { discordClaim } from "./discordClaim";
import { display } from "./display";
import { donate } from "./donate";
import { emergency } from "./emergency";
import { errors } from "./errors";
import { event } from "./event";
import { eventUi } from "./eventUi";
import { food } from "./food";
import { footer } from "./footer";
import { games } from "./games";
import { guestDiscord } from "./guestDiscord";
import { guestForm } from "./guestForm";
import { health } from "./health";
import { home } from "./home";
import { joinPage } from "./joinPage";
import { lanForm } from "./lanForm";
import { language } from "./language";
import { leadSteps } from "./leadSteps";
import { leadTasks } from "./leadTasks";
import { legal } from "./legal";
import { mail } from "./mail";
import { mailtpl } from "./mailtpl";
import { mailVar } from "./mailVar";
import { maintenance } from "./maintenance";
import { manage } from "./manage";
import { member } from "./member";
import { memberActions } from "./memberActions";
import { memberList } from "./memberList";
import { missing } from "./missing";
import { missingSteps } from "./missingSteps";
import { moderation } from "./moderation";
import { nav } from "./nav";
import { newEvent } from "./newEvent";
import { notice } from "./notice";
import { nudge } from "./nudge";
import { ops } from "./ops";
import { orgas } from "./orgas";
import { packing } from "./packing";
import { pager } from "./pager";
import { pages } from "./pages";
import { payments } from "./payments";
import { picker } from "./picker";
import { platformRoles } from "./platformRoles";
import { profile } from "./profile";
import { publish } from "./publish";
import { reminderButtons } from "./reminderButtons";
import { report } from "./report";
import { roleA } from "./roleA";
import { roleInfo } from "./roleInfo";
import { roles } from "./roles";
import { seatFlow } from "./seatFlow";
import { seatMap } from "./seatMap";
import { seatSetup } from "./seatSetup";
import { settingDefs } from "./settingDefs";
import { settingGroups } from "./settingGroups";
import { settingsUi } from "./settingsUi";
import { share } from "./share";
import { stats } from "./stats";
import { status } from "./status";
import { support } from "./support";
import { suspended } from "./suspended";
import { swaps } from "./swaps";
import { systemMail } from "./systemMail";
import { templateEditor } from "./templateEditor";
import { travel } from "./travel";
import { typeForm } from "./typeForm";
import { typePage } from "./typePage";
import { usage } from "./usage";
import { waitlistPanel } from "./waitlistPanel";
import { welcome } from "./welcome";
import { whatsapp } from "./whatsapp";
import { wishCheck } from "./wishCheck";
import { wishes } from "./wishes";

export const de: Messages = {
  addMember,
  admin,
  adminDonations,
  adminLog,
  adminSettings,
  attendees,
  audit,
  auditLog,
  auth,
  backups,
  bot,
  changelog,
  chart,
  chat,
  checklist,
  claimGuest,
  claimLink,
  clanForm,
  clanHeader,
  clanPage,
  clans,
  clanSettings,
  cmd,
  colors,
  common,
  contacts,
  costs,
  discordClaim,
  display,
  donate,
  emergency,
  errors,
  event,
  eventUi,
  food,
  footer,
  games,
  guestDiscord,
  guestForm,
  health,
  home,
  joinPage,
  lanForm,
  language,
  leadSteps,
  leadTasks,
  legal,
  mail,
  mailtpl,
  mailVar,
  maintenance,
  manage,
  member,
  memberActions,
  memberList,
  missing,
  missingSteps,
  moderation,
  nav,
  newEvent,
  notice,
  nudge,
  ops,
  orgas,
  packing,
  pager,
  pages,
  payments,
  picker,
  platformRoles,
  profile,
  publish,
  reminderButtons,
  report,
  roleA,
  roleInfo,
  roles,
  seatFlow,
  seatMap,
  seatSetup,
  settingDefs,
  settingGroups,
  settingsUi,
  share,
  stats,
  status,
  support,
  suspended,
  swaps,
  systemMail,
  templateEditor,
  travel,
  typeForm,
  typePage,
  usage,
  waitlistPanel,
  welcome,
  whatsapp,
  wishCheck,
  wishes,
};
