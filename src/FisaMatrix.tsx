import * as chrono from "chrono-node";

import {
  // AreaChartOutlined,
  // BarChartOutlined,
  CloseOutlined,
  CodepenOutlined,
  ExportOutlined,
  // GithubFilled,
  ImportOutlined,
  InfoCircleOutlined,
  // LineChartOutlined,
  PlusOutlined,
  WarningFilled,
} from "@ant-design/icons";
import {
  AutoComplete,
  Avatar,
  // Badge,
  Button,
  Card,
  // Col,
  Collapse,
  ColorPicker,
  ConfigProvider,
  Divider,
  Flex,
  Input,
  Layout,
  List,
  Modal,
  // Row,
  Select,
  // Space,
  // Switch,
  Tabs,
  // Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import {
  _clearData,
  exportDb,
  resetPersistentStorage,
  useSqlite3,
} from "./lib/db/DB";
import {
  balanceGet,
  categoryAgrsDataGet,
  debitRepeatsDataGet,
  debitSumCmLRGet,
  debitSumDataGet,
  extractDailyDebitCredit,
  extractDataSource,
  rankMapTopCat,
} from "./lib/fmt";
import { castToArray, debounce, rangeData, rangeToStr } from "./lib/utils";
import {
  cmd_addCategory,
  cmd_removeCategory,
} from "./lib/db/models/categories";
import { cmd_createRecords, parseCSVData } from "./lib/db/models/transactions";
import { renderCat, salaryMonthPrompt } from "./lib/extra";
import { useEffect, useRef, useState } from "react";
import { useQueries, useResultTable, useStore } from "tinybase/debug/ui-react";

import { ChartCategoryAggregates } from "./components/ChartCategoryAggregates";
import { ChartCategoryBreakdown } from "./components/ChartCategoryBreakdown";
import { ChartDailyCredit } from "./components/ChartDailyCredit";
import { ChartDailyDebit } from "./components/ChartDailyDebit";
import { ChartDebitRepeats } from "./components/ChartDebitRepeats";
import { ChartMonthlyDebit } from "./components/ChartMonthlyDebit";
import EmojiPicker from "./components/EmojiPicker";
import { InfoModalContent } from "./components/InfoModalContent";
import MiniSearch from "minisearch";
import { TableDataset } from "./components/TableDataset";
// import { TableUncategorized } from "./components/TableUncategorized";
import axios from "axios";
import dayjs from "dayjs";
import { mockDataGet } from "./lib/db/mock";
import { ranges } from "./lib/db/queries/queries";
import { usePersister } from "./context/PersisterContext";
import { xM } from "./config";

export const FisaMatrix = () => {
  const [modal, modalCtxHolder] = Modal.useModal();
  console.log(modalCtxHolder);

  const [useUSD, setUseUSD] = useState(false);
  console.log(setUseUSD);

  const [exchangeRates, setExchangeRates] = useState<any>(null);

  const [filterRange, setFilterRange] = useState<string>("7d");

  const [graphType, setGraphType] = useState<"bar" | "area" | "line">("bar");
  const [aggregateType, setAggregateType] = useState<"sum" | "count">("sum");
  const [repeatsType, setRepeatsType] = useState<"repeats" | "all">("all");
  console.log(repeatsType);

  const [datasetOpen, setDatasetOpen] = useState<any>([]);
  const datasetRef = useRef<any>(null);

  const [openStates, setOpenStates] = useState({
    modalCat: false,
    modalInfo: false,
  });
  const getOpenHandler = (key: string) => {
    return {
      //@ts-ignore
      isOpen: openStates[key],
      open: () => setOpenStates((state) => ({ ...state, [key]: true })),
      close: () => setOpenStates((state) => ({ ...state, [key]: false })),
      toggle: () =>
        //@ts-ignore
        setOpenStates((state) => ({ ...state, [key]: !state[key] })),
    };
  };
  const modalInfo = getOpenHandler("modalInfo");
  const modalCat = getOpenHandler("modalCat");
  const [catName, setCatName] = useState<string>("Food");
  const [catEmoji, setCatEmoji] = useState("🥑");
  const [catColor, setCatColor] = useState("#00FF77");

  const [catDisplay, setCatDisplay] = useState<any>(<></>);
  console.log(catDisplay);
  
  const [catBkdn, setCatBkdn] = useState<any>(null);

  useEffect(() => {
    setCatDisplay(<></>);
    setCatBkdn(null);
  }, [filterRange, aggregateType]);

  useEffect(() => {
    if (localStorage.getItem("graphType")) { 
      setGraphType(
        localStorage.getItem("graphType") as "bar" | "area" | "line"
      );
    }
    if (localStorage.getItem("aggregateType")) {
      setAggregateType(
        localStorage.getItem("aggregateType") as "sum" | "count"
      );
    }
    if (localStorage.getItem("repeatsType")) {
      setRepeatsType(localStorage.getItem("repeatsType") as "repeats" | "all");
    }
    if (!localStorage.getItem("infoShown")) {
      modalInfo.open();
    }
  }, []);

  const store = useStore();
  const queries = useQueries();

  const {
    sqlite3Persister,
    indexedDBPersister,
    sqlite3Instance,
    setIndexedDBPersister,
    setSqlite3Persister,
    setSqlite3Instance,
  } = usePersister();

  if (
    store === undefined ||
    queries === undefined ||
    sqlite3Persister === undefined ||
    indexedDBPersister === undefined ||
    sqlite3Instance === undefined ||
    setIndexedDBPersister === undefined ||
    setSqlite3Persister === undefined ||
    setSqlite3Instance === undefined
  )
    return;

  const trx = useResultTable("getTransactions_" + filterRange);

  const [trxFiltered, setTrxFiltered] = useState<any>(null);
  const [lastSearch, setLastSearch] = useState<any>(null);
  const [searchAutocomplete, setSearchAutocomplete] = useState<any>([]);
  const miniSearch = new MiniSearch({
    fields: [
      "to",
      "from",
      "category",
      "type",
      "note",
      "ref",
      "loc",
      "uncategorized",
    ],
    idField: "key",
    searchOptions: {
      fuzzy: 0.2,
      boost: { to: 2, from: 2, category: 2 },
    },
    extractField: (doc: any, field: string) => {
      if (field === "uncategorized") {
        const uncategorized = doc["category"] === "_undefined_";
        return uncategorized && "uncategorized";
      }
      return doc[field];
    },
  });
  miniSearch.removeAll();
  miniSearch.addAll(extractDataSource(trx));

  const categories = useResultTable("getCategories");

  const balances = useResultTable("getBalances");
  const balance = balanceGet(balances);
  console.log(balance);

  const categorized = useResultTable("getCategorizedCount");
  console.log(categorized);

  const categoryAgrs = castToArray(
    useResultTable("getCategoryAgrs_" + filterRange)
  );
  const categoryAgrsCm = castToArray(useResultTable("getCategoryAgrs__cm"));
  const categoryAgrsData = categoryAgrsDataGet(categoryAgrs);

  const debitAgrs = useResultTable("getDebitAgrs_" + filterRange);
  const debitSumCmLR = debitSumCmLRGet(xM, queries);
  const debitSumData = debitSumDataGet({ queries });
  const debitRepeats = castToArray(
    useResultTable("getDebitRepeats_" + filterRange)
  );
  const debitRepeatsData = debitRepeatsDataGet({ debitRepeats, aggregateType });
  const creditAgrs = useResultTable("getCreditAgrs_" + filterRange);
  const uncategorized = useResultTable("getUncategorized");
  console.log(uncategorized);

  /* Credits in the last 31 days */
  const salary_candidates = castToArray(
    useResultTable("getSalaryCandidates31d")
  );

  /* Field [to] ranked to find its most frequent category */
  const to_category_ranked = rankMapTopCat(
    castToArray(useResultTable("getToCategoryRanked"))
  );

  /* Utility function to globally format currency */
  const curr = (value: string, prefix: string = "", approx: string = "≈ ") => {
    let convert = useUSD;
    let rate = exchangeRates?.MVR;
    if (!rate) convert = false;
    let num = parseFloat(value);
    num = convert ? num / exchangeRates?.MVR : num;
    return `${convert ? approx + "USD" : "MVR"} ${prefix}${
      convert ? "$" : ""
    }${num.toLocaleString("en", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleSearch = (value: string) => {
    if (value === "") {
      setSearchAutocomplete([]);
      setTrxFiltered(null);
      setLastSearch(null);
      return;
    }
    setLastSearch(value);
    const autocomplete = miniSearch.autoSuggest(value, {
      fuzzy: 0.2,
      boost: { to: 2, from: 2, category: 2, type: 2 },
    });
    setSearchAutocomplete(
      autocomplete.map((i: any) => {
        return {
          label: i.suggestion,
          value: i.suggestion,
        };
      })
    );
    const searchResult = miniSearch.search(value);
    let filtered = [];
    if (searchResult.length > 0) {
      filtered = extractDataSource(trx).filter((i: any) => {
        return searchResult.some((j: any) => i.key === j.id);
      });
    } else {
      const parsed = chrono.parseDate(value);
      if (parsed) {
        const date = dayjs(parsed);
        filtered = extractDataSource(trx).filter((i: any) =>
          dayjs(i.date, "DD-MM-YYYY").isSame(date, "day")
        );
      }
    }
    setTrxFiltered(filtered);
  };

  const handleGotoDate = (_e: any, _chart: any, options: any) => {
    const date = options.w.globals.labels[options?.dataPointIndex];
    if (date) {
      if (datasetOpen.length === 0) setDatasetOpen(["1"]);
      if (datasetRef.current) {
        const filtered = extractDataSource(trx).filter((i: any) =>
          dayjs(i.date, "DD-MM-YYYY").isSame(dayjs(date, "DD-MM-YYYY"), "day")
        );
        if (filtered.length > 0) {
          setTrxFiltered(filtered);
          datasetRef.current.scrollIntoView();
        }
      }
    }
  };

  const closeModalInfo = () => {
    modalInfo.close();
    localStorage.setItem("infoShown", "true");
  };

  useEffect(() => {
    lastSearch && handleSearch(lastSearch);
  }, [trx]);

  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await axios.get(
          "https://open.er-api.com/v6/latest/USD"
        );
        const rates = response?.data?.rates;
        setExchangeRates(rates);
      } catch (error) {
        message.error("Failed to fetch exchange rates");
        console.error("Failed to fetch exchange rates:", error);
      }
    };
    fetchExchangeRate();
  }, []);

  if (!trx || !categories) return;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Header
        style={{
          backgroundColor: "#000",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 20px",
        }}
      >
        <Typography.Title style={{ fontSize: "24px" }}>
        FisaTrack
        </Typography.Title>
        <WarningFilled
          style={{ fontSize: "16px", color: "#FFB01A", cursor: "pointer" }}
          onClick={() => modalInfo.open()}
        />
      </Layout.Header>
      <span>
            <Select
              style={{ width: 120, textAlign: "left" }}
              options={Object.keys(ranges).map((key: string) => {
                return {
                  label: rangeToStr[key],
                  value: key,
                };
              })}
              value={filterRange}
              onClick={() =>
                salaryMonthPrompt({ modal, salary_candidates, curr })
              }
              onChange={(value) => {
                setFilterRange(value);
              }}
            />
          </span>
      <Modal
        title={<h2>FisaTrack BETA 🔥</h2>}
        width={400}
        footer={
          <Button type="primary" onClick={closeModalInfo}>
            Close
          </Button>
        }
        open={modalInfo.isOpen}
        onCancel={closeModalInfo}
        onOk={closeModalInfo}
      >
        <InfoModalContent trx={trx} store={store} modalInfo={modalInfo} />
      </Modal>

      <Tabs defaultActiveKey="1" centered>
        <Tabs.TabPane tab="Daily Debit" key="1">
          <Card bordered={false}>
            <ChartDailyDebit
              graphType={graphType}
              series={[
                {
                  name: "debit",
                  data: extractDailyDebitCredit(trx, "debited", rangeData(filterRange)),
                },
              ]}
              title={curr(debitAgrs[0]?.sum.toString() ?? "0", "", "")}
              yformat={(val: any) => curr(val)}
              selection={handleGotoDate}
            />
          </Card>
          <Card bordered={false}>
            <ChartDailyCredit
              graphType={graphType}
              series={[
                {
                  name: "credit",
                  data: extractDailyDebitCredit(trx, "credited", rangeData(filterRange)),
                },
              ]}
              title={curr(creditAgrs[0]?.sum.toString() ?? "0", "", "")}
              yformat={(val: any) => curr(val)}
              selection={handleGotoDate}
            />
          </Card>
        </Tabs.TabPane>
          
        <Tabs.TabPane tab="Categories" key="2">
          <Card bordered={false}>
            <ChartCategoryAggregates
              Key={aggregateType + filterRange + useUSD + "pie"}
              series={
                aggregateType === "sum"
                  ? categoryAgrsData.map((i: any) => i.sum)
                  : categoryAgrsData.map((i: any) => i.count)
              }
              setCatDisplay={setCatDisplay}
              catSetter={(catIndex: any) => {
                if (!catIndex) {
                  setCatBkdn(null);
                }
                const categoryAgr = categoryAgrs.find(
                  (i: any) =>
                    i.category === categoryAgrsData[catIndex]?.key
                );
                if (categoryAgr) {
                  const category = categories[categoryAgr.category];
                  const data = castToArray(trx).filter(
                    (i: any) => i.category === categoryAgr?.category
                  );
                  const dataGrouped = data.reduce(
                    (acc: any, cur: any) => {
                      const key = cur.to;
                      if (!acc[key]) {
                        acc[key] = {
                          key,
                          sum: 0,
                          count: 0,
                          avg: 0,
                        };
                      }
                      const amount = cur?.debited
                        ? parseFloat(cur?.debited)
                        : parseFloat(cur?.credited);
                      acc[key].sum += amount;
                      acc[key].count++;
                      acc[key].avg = acc[key].sum / acc[key].count;
                      return acc;
                    },
                    {}
                  );
                  const resultArray = Object.values(dataGrouped).sort(
                    (a: any, b: any) =>
                      aggregateType === "sum"
                        ? b.sum - a.sum
                        : b.count - a.count
                  );

                  // sort by sum
                  setCatBkdn({
                    category: category,
                    data: resultArray,
                  });
                }
              }}
              renderCatDisplay={(selected: number) =>
                renderCat({
                  selected,
                  categoryAgrs,
                  categoryAgrsData,
                  categoryAgrsCm,
                  categories,
                  queries,
                  curr,
                  setCatDisplay,
                })
              }
              title={
                "Category Aggregates" +
                " (" +
                rangeToStr[filterRange] +
                ")"
              }
              labelFormat={(val: any) => `${categories[val]?.emoji} ${val}`}
              valueFormat={(val: any) =>
                aggregateType === "sum"
                  ? curr(val)
                  : `${val} trx`
              }
              labels={categoryAgrsData.map((i: any) => i.key)}
              tooltipFormat={(val: any) =>
                aggregateType === "sum"
                  ? curr(val)
                  : `${val} trx`
              }
            />
            {catBkdn?.data && catBkdn.data.length > 0 && (
              <Card>
                <ChartCategoryBreakdown
                  Key={aggregateType + filterRange + useUSD + "pie3"}
                  series={
                    aggregateType === "sum"
                      ? catBkdn.data.map((i: any) => i.sum)
                      : catBkdn.data.map((i: any) => i.count)
                  }
                  catBkdn={catBkdn}
                  yformat={(val: any, opts: any) =>
                    aggregateType === "sum"
                      ? `${curr(val)} (${catBkdn.data[opts.seriesIndex]?.count} trx, avg ${catBkdn.data[opts.seriesIndex]?.avg.toFixed(2)})`
                      : `${val} (${curr(catBkdn.data[opts.seriesIndex]?.sum.toString())})`
                  }
                />
              </Card>
            )}
          </Card>
          {debitSumData.data.length > 0 && (
            <Card>
              <ChartMonthlyDebit
                series={[{ name: "Debit Sum", data: debitSumData.data }]}
                selection={function (_e: any, _chart: any, opts: any) {
                  const isLast =
                    opts.dataPointIndex === debitSumData.data.length - 1;
                  setFilterRange(
                    isLast
                      ? "_cm"
                      : `__${debitSumData.months[
                          opts.dataPointIndex
                        ].toLowerCase()}`
                  );
                }}
                yformat={function (val: any, opts: any) {
                  const isLast =
                    opts.dataPointIndex === debitSumData.data.length - 1;
                  return isLast ? `${curr(val)}` : `${curr(val)}`;
                }}
                debitSumData={debitSumData}
                debitSumCmLR={debitSumCmLR}
              />
            </Card>
          )}
          <Card>
                {debitRepeatsData.length > 0 && (
                  <ChartDebitRepeats
                    Key={aggregateType + filterRange + useUSD + "pie2"}
                    series={
                      aggregateType === "sum"
                        ? debitRepeatsData.map((i: any) => i.sum)
                        : debitRepeatsData.map((i: any) => i.count)
                    }
                    title={
                      "Debit Overview" + " (" + rangeToStr[filterRange] + ")"
                    }
                    labels={debitRepeatsData.map((i: any) => i.key)}
                    tooltipFormat={function (val: any, opts: any) {
                      return aggregateType === "sum"
                        ? `${curr(val)} (${
                            debitRepeatsData[opts.seriesIndex]?.count
                          } trx, avg ${debitRepeatsData[
                            opts.seriesIndex
                          ]?.avg.toFixed(2)})`
                        : `${val} (${curr(
                            debitRepeatsData[opts.seriesIndex]?.sum.toString()
                          )})`;
                    }}
                  />
                )}
                <Select
                  style={{ textAlign: "left", width: "50px" }}
                  options={[
                    { label: ">1", value: "repeats" },
                    { label: "All", value: "all" },
                  ]}
                  value={repeatsType}
                  onChange={(value) => {
                    setRepeatsType(value);
                    localStorage.setItem("repeatsType", value);
                    window.location.reload();
                  }}
                />
              </Card>
          <Collapse
            collapsible="icon"
            items={[
              {
                key: "1",
                label: (
                  <Flex justify="space-between">
                    <strong>Categories</strong>
                    <Button
                      size="small"
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={modalCat.open}
                    />
                    <Modal
                      title="New Category"
                      open={modalCat.isOpen}
                      onOk={modalCat.close}
                      onCancel={modalCat.close}
                      closeIcon={null}
                      width={300}
                      footer={[
                        <Button
                          type="primary"
                          onClick={() => {
                            cmd_addCategory(store, catName, catEmoji, catColor);
                            setCatName("");
                            //setCatEmoji("");
                            //setCatColor("");
                            modalCat.close();
                          }}
                        >
                          Add
                        </Button>,
                      ]}
                    >
                      <Flex gap="small">
                        <Input
                          value={catName}
                          style={{ width: "250px" }}
                          onChange={(e) => setCatName(e.target.value)}
                        />
                        <Flex>
                          <EmojiPicker
                            value={catEmoji}
                            onChange={(emoji: string) => setCatEmoji(emoji)}
                          />
                          <ColorPicker
                            value={catColor}
                            size="large"
                            onChange={(color) =>
                              setCatColor(color.toHexString())
                            }
                          />
                        </Flex>
                      </Flex>
                    </Modal>
                  </Flex>
                ),
                children: (
                  <List itemLayout="horizontal">
                    {castToArray(categories)
                      .sort((a: any, b: any) => a.name.localeCompare(b.name))
                      .map((item: any) => (
                        <List.Item key={item.name}>
                          <List.Item.Meta
                            avatar={
                              <Avatar
                                size={26}
                                shape="square"
                                style={{ backgroundColor: item.color }}
                              >
                                {item.emoji}
                              </Avatar>
                            }
                            title={
                              <strong style={{ fontSize: 16 }}>
                                {item.name}
                              </strong>
                            }
                          />
                          <Button
                            shape="circle"
                            size="small"
                            type="text"
                            danger
                            icon={<CloseOutlined size={1} />}
                            onClick={() => {
                              const id = item.name;
                              if (id) cmd_removeCategory(store, id);
                            }}
                          />
                        </List.Item>
                      ))}
                  </List>
                ),
              },
            ]}
          />
        </Tabs.TabPane>

        <Tabs.TabPane tab="Dataset" key="3">
          <Flex vertical gap="middle">
            <Flex style={{ flex: 1, justifyContent: "flex-end" }}>
              <Flex>
                <Button
                  size="small"
                  icon={
                    <CloseOutlined style={{ color: "#77777740" }} />
                  }
                  type="text"
                  onClick={() => {
                    setTrxFiltered(null);
                    setLastSearch(null);
                  }}
                />
                <AutoComplete
                  popupMatchSelectWidth={true}
                  style={{ width: 250 }}
                  options={searchAutocomplete}
                  onSelect={(value: any) =>
                    debounce(handleSearch)(value)
                  }
                  onSearch={(value: any) =>
                    debounce(handleSearch)(value)
                  }
                  size="large"
                >
                  <Input.Search
                    size="middle"
                    allowClear
                    placeholder="search anything"
                  />
                </AutoComplete>
              </Flex>
              <Flex
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: "8px",
                }}
              >
                <ConfigProvider
                  theme={{
                    token: {
                      borderRadius: 2,
                    },
                  }}
                >
                  <Tooltip
                    overlayInnerStyle={{ color: "lightgrey" }}
                    overlayStyle={{
                      fontSize: "11px",
                      fontStyle: "italic",
                      borderRadius: "2px",
                    }}
                    color="#141414"
                    title={`Search "salary" "bakery" "ahmed" "transfer" "uncategorized" ...or a date in any format "last friday" "three days ago" "22 jul"`}
                  >
                    <InfoCircleOutlined
                      style={{ color: "#77777730" }}
                    />
                  </Tooltip>
                </ConfigProvider>
              </Flex>
            </Flex>
            <TableDataset
              dataSource={
                trxFiltered ? trxFiltered : extractDataSource(trx)
              }
              curr={curr}
              categories={categories}
              to_category_ranked={to_category_ranked}
              store={store}
            />
          </Flex>
        </Tabs.TabPane>

        <Tabs.TabPane tab="Settings" key="4">
          <Card title="Settings">
            <Select
              style={{ textAlign: "left", width: "100%" }}
              options={[
                { label: "Sum", value: "sum" },
                { label: "TRXs", value: "count" },
              ]}
              value={aggregateType}
              onChange={value => {
                setAggregateType(value);
                localStorage.setItem("aggregateType", value);
              }}
            />
            <Upload
              accept=".csv,.CSV"
              showUploadList={false}
              beforeUpload={file => {
                const reader = new FileReader();
                reader.readAsText(file);
                reader.onload = e => {
                  if (e?.target?.result) {
                    const rows = parseCSVData(e.target.result);
                    if (rows.length > 0) {
                      cmd_createRecords(store, rows);
                    }
                  }
                };
                return false;
              }}
            >
              <Button size="large" type="primary" icon={<ImportOutlined />}>
                Import Statement CSV
              </Button>
            </Upload>
            <span
              style={{
                fontSize: "10px",
                color: "grey",
                marginBottom: "-4px",
              }}
            >{`Duplicates will be skipped.`}</span>
            <Divider orientation="center">Database</Divider>
            <Flex gap="middle" wrap="wrap">
              <Button
                icon={<ExportOutlined />}
                type="text"
                onClick={() => {
                  if (!sqlite3Persister || !sqlite3Instance) {
                    useSqlite3(
                      sqlite3Persister,
                      setSqlite3Persister,
                      sqlite3Instance,
                      setSqlite3Instance,
                      store
                    ).then(({ persister, sqlite3 }) =>
                      exportDb(persister, sqlite3)
                    );
                  } else {
                    exportDb(sqlite3Persister, sqlite3Instance);
                  }
                }}
              >
                Export SQLite
              </Button>
              <Upload
                accept=".db,.DB,.sqlite,.sqlite3"
                showUploadList={false}
                beforeUpload={file => {
                  if (!indexedDBPersister) return false;
                  const reader = new FileReader();
                  reader.readAsArrayBuffer(file);
                  reader.onload = async (e:any) => {
                    const buffer = e.target.result as ArrayBuffer;
                    await useSqlite3(
                      sqlite3Persister,
                      setSqlite3Persister,
                      sqlite3Instance,
                      setSqlite3Instance,
                      store,
                      buffer,
                      indexedDBPersister
                    );
                  };
                  return false;
                }}
              >
                <Button type="text" icon={<CodepenOutlined />}>
                  Import SQLite
                </Button>
              </Upload>
              <Button
                danger
                onClick={() => {
                  resetPersistentStorage(
                    store,
                    indexedDBPersister,
                    setIndexedDBPersister
                  );
                  localStorage.clear();
                }}
              >
                Clear and Reset Defaults
              </Button>
              <Button
                danger
                type="text"
                onClick={() => {
                  _clearData(store);
                  localStorage.clear();
                }}
              >
                Wipe Database
              </Button>
            </Flex>
            <Card title="Mock Data" bordered={true}>
              <Button
                type="dashed"
                onClick={() => {
                  if (extractDataSource(trx).length > 0) {
                    message.error(
                      "Cannot create mock data while data is present"
                    );
                    return;
                  }
                  const mock = mockDataGet(100);
                  cmd_createRecords(store, mock);
                }}
              >
                Generate Mock Data
              </Button>
            </Card>
          </Card>
        </Tabs.TabPane>
      </Tabs>

      <Layout.Footer style={{ textAlign: "center" }}>
        Made for You ❤️ UAH .
      </Layout.Footer>
    </Layout>
  );
};
