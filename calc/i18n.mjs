// The page's words, in the languages the app speaks, chosen from what the browser asks for. The lines the app
// also shows are its own, copied from lib/l10n/intl_en.arb and intl_zh.arb so the two read the same; the rest
// belong to this page alone.
//
// t('key', {name: value}) fills {name} in the line. Anything in the HTML with data-i18n="key" is filled in at
// startup, and data-i18n-title="key" fills its tooltip.

const STRINGS = {
  en: {
    calc_title: 'Calculator',
    vault_title: 'Vault',
    common_version: 'Version 1.4.0, build 2026/07/18',
    common_copyright: '© ZOUSOFT.COM 2026. All RIGHTS RESERVED.',
    common_ok: 'OK',
    calc_invalid_input: 'Invalid input',
    calc_infinity: 'Infinity',
    calc_copied: "Copied '{result}' to your clipboard.",
    path_row_root: 'Vault',

    menu: 'Menu',
    sort: 'Sort',
    sort_by_time: 'By Time',
    sort_by_size: 'By Size',
    sort_by_type: 'By Type',
    sort_by_name: 'By Name',
    image_size: 'Set Image Size',
    size_smallest: 'Smallest',
    size_small: 'Small',
    size_normal: 'Normal',
    size_big: 'Big',
    size_biggest: 'Biggest',

    calc_data_locations: "Data folders...",
    data_loc_title: "Data folders",
    data_loc_hint: "Vaults can be kept in several folders, for example on another drive. A password is looked for in all of them. Forgetting a folder only forgets it: its vaults stay where they are.",
    vault_drawer_exit_vault: "Exit vault",
    trust_title: "Before you type your password here",
    trust_what: "This page comes from a website. We do our best, but we cannot guarantee that the website won't be hacked, or that a plugin in your browser won't steal your password. Nothing about the encryption prevents that: it is the price of opening a vault in a browser.",
    trust_app: "<b>The Windows app cannot be changed from a distance</b>, and is the safer place for a vault you care about. It does everything this page does, and connects to your phone as well. Carry on here if you would rather, knowing that.",
    trust_app_btn: "Download the Windows app",
    trust_go_on: "Continue",
    data_loc_missing: "Not found (is the drive connected?)",
    data_loc_add: 'Add a data folder...',
    data_loc_n: 'Folder {n}: {label}',
    folder_reading: 'reading...',
    data_loc_vaults: '{count} vaults',
    data_loc_one_vault: '1 vault',
    folder_old_vaults: ', {n} not upgraded yet (open them once in the app)',
    folder_one_old_vault: ', 1 not upgraded yet (open it once in the app)',
    folder_empty: 'No vaults in this folder',
    folder_needs_permission: 'Tap to let this page read it',
    data_loc_remove: 'Forget this folder',

    show_file_names: 'Show file names',
    show_file_names_sub: 'the name over each photo and video',
    common_about: "About...",
    about_web_remembers: "Only which folders you chose are remembered, and the browser asks before this page may read one again.",
    about_adds_nothing: 'New photos and videos are added on the phone. Here you can look at what a vault holds, export a copy and delete what you no longer want.',
    about_what: "Deep Ocean opens a vault from a folder on this device, and shows what is in it.",
    about_nothing_leaves: "Nothing leaves this device: a vault is read from the folder it is in, and the only copies made are the ones you export yourself.",
    about_nothing_written: "What a vault holds can be looked after here: renamed, moved, given a cover, exported and deleted.",
    about_password: "The password never leaves this device. It becomes the vault's key here, the same way everywhere.",

    opened_in: 'opened in {ms} ms',
    items: '{n} items',
    empty: 'Empty',
    close: 'Close',
    previous: 'Previous',
    next: 'Next',
    decrypting: 'Decrypting...',
    played_from_folder: '{mb} MB, played from the folder (nothing stored)',
    decrypted_in_memory: '{mb} MB decrypted in {ms} ms (in memory only)',
    could_not_decrypt: 'Could not decrypt {name}: {error}',

    common_confirm: 'Please Confirm',
    common_cancel: 'Cancel',
    vault_btn_new_folder: 'New Folder',
    vault_btn_decrypt: 'Decrypt',
    vault_btn_delete: 'Delete',
    vault_btn_refresh: 'Refresh',
    ctx_btn_sel_all: 'Select All',
    ctx_btn_sel_none: 'Select None',
    ctx_btn_sel_cancel: 'Cancel',
    ctx_btn_rename: 'Rename Selected',
    ctx_btn_set_as_cover: 'Set as Cover',
    ctx_btn_cut: 'Cut',
    ctx_btn_paste: 'Paste',
    ctx_btn_file_info: 'File Info...',
    vault_create_new_subfolder: 'Create a new subfolder',
    vault_please_type_folder_name: 'Please type the new folder name',
    vault_failed_to_create_new_subfolder: 'Failed to create the new subfolder',
    rename_dlg_title: 'Rename \'{oldName}\'',
    rename_dlg_type_new_name: 'Please type the new name',
    vault_to_del_confirm_msg: 'Do you really want to delete those selected {itemCount} file(s) or folder(s)? Please be aware that all deleted files will be gone forever, and deleting a folder will delete all files in it, recursively.',
    vault_del_success: 'Successfully deleted {deletedFileCnt} file(s) and {deletedFolderCnt} folder(s).',
    vault_to_del_items_hint: 'Please long press on an item then select all you want to delete items first.',
    file_info_title: 'File Info',
    file_info_name: 'Name',
    file_info_type: 'Type',
    file_info_size: 'Size',
    file_info_created: 'Created',
    file_info_dimensions: 'Dimensions',
    file_info_duration: 'Duration',
    file_info_path: 'Original path',
    file_info_encryption: 'Encryption',
    file_info_type_image: 'Image',
    file_info_type_video: 'Video',
    file_info_type_other: 'File',
    file_info_enc_v2: 'ChaCha20-Poly1305 (v2)',
    file_info_enc_v1: 'Legacy (v1)',
    vault_to_decrypt_success: 'Successfully decrypted selected {count} items.',
    write_not_supported: 'This browser cannot change a folder; Chrome and Edge can.',
    write_permission: 'The browser must be allowed to change this folder.',
    writing_warning: 'Close this vault in the app before changing it here, or the app may write over what you change.',
    moved: '{n} moved',
    downloaded: 'Decrypted {name} to your downloads.',
    delete_failed: 'Could not delete it.',
  },

  zh: {
    calc_title: '计算器',
    vault_title: '保险柜',
    common_version: '版本 1.4.0, 发布日期 2026/07/18',
    common_copyright: '© ZOUSOFT.COM 2026. 版权所有。',
    common_ok: '确定',
    calc_invalid_input: '算式不正确',
    calc_infinity: '无穷大',
    calc_copied: '复制了‘{result}’到您的系统剪贴板。',
    path_row_root: '保险柜',

    menu: '菜单',
    sort: '排序',
    sort_by_time: '按时间',
    sort_by_size: '按大小',
    sort_by_type: '按类型',
    sort_by_name: '按名称',
    image_size: '设置图片大小',
    size_smallest: '最小',
    size_small: '较小',
    size_normal: '正常',
    size_big: '较大',
    size_biggest: '最大',

    calc_data_locations: "数据文件夹...",
    data_loc_title: "数据文件夹",
    data_loc_hint: "保险柜可以存放在多个文件夹中，例如另一个磁盘。输入密码时会在所有位置中查找。移除某个位置只是不再记住它：其中的保险柜仍保留在原处。",
    vault_drawer_exit_vault: "退出保险柜",
    trust_title: "在这里输入密码之前",
    trust_what: "本页面来自一个网站。我们会尽力，但无法保证该网站不会被入侵，也无法保证您浏览器的插件不会窃取密码。加密本身无法阻止这一点：这是在浏览器中打开保险柜的代价。",
    trust_app: "<b>Windows 版本无法被远程更改</b>，对您看重的保险柜来说是更安全的选择。它能完成本页面的全部功能，还可以连接您的手机。了解这一点之后，您也可以继续在这里使用。",
    trust_app_btn: "下载 Windows 版本",
    trust_go_on: "继续",
    data_loc_missing: "找不到（磁盘是否已连接？）",
    data_loc_add: '添加数据文件夹...',
    data_loc_n: '文件夹 {n}: {label}',
    folder_reading: '正在读取...',
    data_loc_vaults: '{count} 个保险柜',
    data_loc_one_vault: '1 个保险柜',
    folder_old_vaults: '，其中 {n} 个尚未升级（请在应用中打开一次）',
    folder_one_old_vault: '，其中 1 个尚未升级（请在应用中打开一次）',
    folder_empty: '此文件夹中没有保险柜',
    folder_needs_permission: '点击以允许本页面读取',
    data_loc_remove: '不再使用此文件夹',

    show_file_names: '显示文件名',
    show_file_names_sub: '在每张照片和视频上显示名称',
    common_about: "关于...",
    about_web_remembers: "只会记住您选择了哪些文件夹，并且浏览器会在本页面再次读取之前询问您。",
    about_adds_nothing: '新的照片和视频请在手机上添加。这里可以查看保险柜中的内容、导出副本，以及删除不再需要的项目。',
    about_what: "Deep Ocean 从本机上的文件夹打开保险柜，并显示其中的内容。",
    about_nothing_leaves: "没有任何内容离开本机：保险柜从它所在的文件夹读取，只有您自己导出的内容才会被复制出去。",
    about_nothing_written: "保险柜中已有的内容可以在这里整理：重命名、移动、设为封面、导出和删除。",
    about_password: "密码不会离开本机。密码在这里转换成保险柜的密钥，各平台方式相同。",

    opened_in: '用时 {ms} 毫秒打开',
    items: '共{n}项',
    empty: '空',
    close: '关闭',
    previous: '上一个',
    next: '下一个',
    decrypting: '正在解密...',
    played_from_folder: '{mb} MB，直接从文件夹播放（不存储任何内容）',
    decrypted_in_memory: '{mb} MB 已解密，用时 {ms} 毫秒（仅在内存中）',
    could_not_decrypt: '无法解密 {name}：{error}',

    common_confirm: '请确认',
    common_cancel: '取消',
    vault_btn_new_folder: '新建文件夹',
    vault_btn_decrypt: '解密',
    vault_btn_delete: '删除',
    vault_btn_refresh: '刷新',
    ctx_btn_sel_all: '全选',
    ctx_btn_sel_none: '全不选',
    ctx_btn_sel_cancel: '取消',
    ctx_btn_rename: '重命名',
    ctx_btn_set_as_cover: '设为封面',
    ctx_btn_cut: '剪切',
    ctx_btn_paste: '粘贴',
    ctx_btn_file_info: '文件信息...',
    vault_create_new_subfolder: '创建新的子目录',
    vault_please_type_folder_name: '请输入新子目录的名称',
    vault_failed_to_create_new_subfolder: '创建新的子目录失败',
    rename_dlg_title: '重命名 \'{oldName}\'',
    rename_dlg_type_new_name: '请输入新的名称',
    vault_to_del_confirm_msg: '您真的想删除这些选中的{itemCount}图片或子目录吗？请注意文件被删除后将彻底消失，删除一个目录将删除其所包含的所有文件。',
    vault_del_success: '成功删除了{deletedFileCnt}个文件和{deletedFolderCnt}个子目录。',
    vault_to_del_items_hint: '请先长按任意图片，然后选择您想删除的所有图片。',
    file_info_title: '文件信息',
    file_info_name: '名称',
    file_info_type: '类型',
    file_info_size: '大小',
    file_info_created: '创建时间',
    file_info_dimensions: '尺寸',
    file_info_duration: '时长',
    file_info_path: '原始路径',
    file_info_encryption: '加密方式',
    file_info_type_image: '图片',
    file_info_type_video: '视频',
    file_info_type_other: '文件',
    file_info_enc_v2: 'ChaCha20-Poly1305 (v2)',
    file_info_enc_v1: '旧版 (v1)',
    vault_to_decrypt_success: '成功解密了选中的{count}个图片。',
    write_not_supported: '此浏览器无法修改文件夹；Chrome 和 Edge 可以。',
    write_permission: '需要允许浏览器修改此文件夹。',
    writing_warning: '在此修改之前请先在应用中关闭该保险柜，否则应用可能覆盖您在这里所做的修改。',
    moved: '已移动 {n} 项',
    downloaded: '已将 {name} 解密到您的下载文件夹。',
    delete_failed: '无法删除。',
  },
};

//The browser's languages, most wanted first: the first one this page speaks wins. Order matters -- someone
//whose list is en-US, zh-CN wants English, even though Chinese is in the list.
export function pick(tags) {
  for (const tag of (tags ?? []).map((t) => String(t).toLowerCase())) {
    if (tag.startsWith('zh')) return 'zh';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en'; //a language the app does not speak either
}

export const language = pick(navigator.languages ?? [navigator.language ?? 'en']);

const words = STRINGS[language];

export function t(key, values) {
  let line = words[key] ?? STRINGS.en[key] ?? key;
  if (values) for (const [name, value] of Object.entries(values)) line = line.replaceAll(`{${name}}`, value);
  return line;
}

/// Fills in everything the page marked with data-i18n (its text) or data-i18n-title (its tooltip).
export function translatePage() {
  document.documentElement.lang = language;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const line = t(el.dataset.i18n);
    if (line.includes('<b>')) el.innerHTML = line;
    else el.textContent = line;
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
    if (el.getAttribute('aria-label')) el.setAttribute('aria-label', el.title);
  }
}
