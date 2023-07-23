import { defineComponent, onMounted, ref } from "vue";
import * as echarts from "echarts";

export const EchartsDemoPage = defineComponent({
  setup() {
    const cn_pop_chart_el = ref<HTMLDivElement>();
    const cn_pop_promise = import("../../assets/chinese_population.json");

    async function load_cn_pop() {
      const echart = echarts.init(cn_pop_chart_el.value!);
      const data = (await cn_pop_promise).default[1];

      const option = {
        title: {
          text: "中国人口",
        },
        tooltip: {
          trigger: "axis",
        },
        toolbox: {
          right: 10,
          feature: {
            dataZoom: {
              yAxisIndex: "none",
            },
            restore: {},
            saveAsImage: {},
          },
        },
        dataset: {
          source: data,
        },
        xAxis: {
          type: "time",
        },
        yAxis: {
          axisLabel: {
            formatter: (value: number) => {
              return value / 100000000 + " 亿";
            },
          },
        },
        series: [
          {
            type: "line",
            showSymbol: false,
            showAllSymbol: false,
            sampling: "average",
            encode: {
              // 将 "amount" 列映射到 X 轴。
              x: "date",
              // 将 "product" 列映射到 Y 轴。
              y: "value",
            },
          },
        ],
      } satisfies Parameters<typeof echart.setOption>[0];

      echart.setOption(option);
    }

    onMounted(async () => {
      const promises = [load_cn_pop()];

      await Promise.all(promises);
    });

    return () => {
      return (
        <div class="page echarts_demo">
          <div class="w-[400px] h-[300px]" ref={cn_pop_chart_el}></div>
        </div>
      );
    };
  },
});
